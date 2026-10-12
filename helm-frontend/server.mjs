// Helm backend: accounts, roles enforced on the server, a SQLite database,
// file storage and live updates. Zero npm dependencies (Node 22.13+).
//   node server.mjs            → http://localhost:5173
// Env: PORT, DATA_DIR (put this on a Railway volume), COOKIE_SECURE=1 behind HTTPS,
//      HELM_SECRET (encrypts connection tokens), PUBLIC_URL, and the app keys listed in connectors.mjs.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { makeConnections } from "./connectors.mjs";
import { makePasskeys } from "./passkeys.mjs";

const scrypt = promisify(_scrypt);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA = process.env.DATA_DIR || join(ROOT, "data");
const FILES = join(DATA, "files");
const PORT = Number(process.env.PORT) || 5173;
const MB = 1024 * 1024, MAX_JSON = 16 * MB, MAX_FILE = 25 * MB;
// How big each saved part may get. Messages have the most room; everything else is a list of short records.
const SEC_MAX = { CONVS: 12 * MB, TASKS: 3 * MB }, SEC_MAX_OTHER = 2 * MB;
const tooBig = (k, v) => JSON.stringify(v).length > (SEC_MAX[k] || SEC_MAX_OTHER);
const MSG_MAX = 4000, MSGS_KEPT = 2000, NEW_MSGS_MAX = 200; // per message, per conversation, per save
// Uploads: a total for the workspace and a share for each person (in MB, can be changed with variables).
const FILES_TOTAL = (+process.env.FILES_QUOTA_MB || 5000) * MB, FILES_EACH = (+process.env.FILES_PER_PERSON_MB || 1000) * MB;
await mkdir(FILES, { recursive: true });

/* ---------------- Database ---------------- */
const db = new DatabaseSync(join(DATA, "helm.db"));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, pkey TEXT UNIQUE, role TEXT, pass TEXT, invite TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS sections(name TEXT PRIMARY KEY, json TEXT, updated INTEGER, by INTEGER);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, owner INTEGER, area TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
DELETE FROM settings WHERE k='acct_sent';
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER, user_id INTEGER, what TEXT);`);
const q = (sql) => db.prepare(sql);
try { db.exec("ALTER TABLE files ADD COLUMN space TEXT"); } catch {} // which space a file was shared in
// Getting back in: remembered devices, new-device sign-ins (shown on your other devices), recovery links, and "can't sign in" requests.
db.exec(`CREATE TABLE IF NOT EXISTS devices(token TEXT PRIMARY KEY, user_id INTEGER, created INTEGER, last INTEGER);
CREATE TABLE IF NOT EXISTS signins(id INTEGER PRIMARY KEY, user_id INTEGER, at INTEGER, what TEXT);
CREATE TABLE IF NOT EXISTS help(user_id INTEGER PRIMARY KEY, at INTEGER);`);
try { db.exec("ALTER TABLE users ADD COLUMN reset TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN reset_at INTEGER"); } catch {}
// Access by PIN: the workspace owner (the CEO) gives each person a PIN and a one-time link that sets up their device.
for (const c of ["pin TEXT", "pin_fails INTEGER DEFAULT 0", "locked INTEGER DEFAULT 0", "blocked INTEGER DEFAULT 0", "link TEXT", "link_at INTEGER"]) { try { db.exec("ALTER TABLE users ADD COLUMN " + c); } catch {} }
const getSetting = (k) => q("SELECT v FROM settings WHERE k=?").get(k)?.v;
const setSetting = (k, v) => q("INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);
const audit = (uid, what) => q("INSERT INTO audit(at,user_id,what) VALUES(?,?,?)").run(Date.now(), uid, what);

/* ---------------- Roles: who can read and write each part of the workspace ---------------- */
const STAFF = ["CEO", "Manager", "Member"], CEO = ["CEO"], MGR = ["CEO", "Manager"], ALL = ["CEO", "Manager", "Member", "Guest"];
const ACL = {
  TASKS: [ALL, STAFF], NOTES: [STAFF, STAFF], PROJ: [STAFF, MGR], SIDEP: [STAFF, MGR], CEV: [STAFF, STAFF], ANN: [STAFF, MGR],
  TEAMP: [STAFF, CEO], MEM: [ALL, CEO], P: [ALL, CEO], SPX: [ALL, ALL], cnt: [ALL, STAFF], stamps: [ALL, STAFF], // SPX is merged per space below
  MROWS: [MGR, MGR], WK: [MGR, MGR], MET: [MGR, MGR],
  NY: [CEO, CEO], NYP: [CEO, CEO], SO: [CEO, CEO], SPSET: [ALL, CEO], CUR: [ALL, CEO], RDEF: [ALL, CEO], TOK: [CEO, CEO], STGS: [STAFF, MGR], dec: [CEO, CEO], DECLOG: [CEO, CEO],
  MNY_B: [CEO, CEO], MNY_BL: [CEO, CEO], MNY_acc: [CEO, CEO], MNY_tx: [CEO, CEO], MNYn: [CEO, CEO],
  LG_meet: [CEO, CEO], LG_mem: [CEO, CEO], LG_fil: [CEO, CEO], LG_ct: [CEO, CEO],
  INV: [CEO, CEO], SAFES: [CEO, CEO], CAP: [CEO, CEO], DR: [CEO, CEO], ROUND: [CEO, CEO], UPD: [CEO, CEO], TS: [CEO, CEO],
  ROLES: [CEO, CEO], CANDS: [CEO, CEO], OB: [CEO, CEO], CN: [CEO, CEO],
  CX: [CEO, []], // what the connections read (Gmail, Drive, Stripe…); only the server writes it
  CONVS: [ALL, ALL], // filtered and merged per person below
  // WG (wages) is never in this list: it is only served by /api/wages, to the CEO and the people given access.
};
const canRead = (sec, role) => ACL[sec]?.[0].includes(role);
const canWrite = (sec, role) => ACL[sec]?.[1].includes(role);

/* ---------------- Job roles: what each kind of person sees ----------------
   Everyone except the CEO has a job role (CTO, Finance, Marketing, Engineering…). Each one has a level, which decides
   what they can change (Manager, Member or Guest), and the areas of Helm they see. The CEO edits these in Settings.
   An area that isn't ticked is never sent to that person, and changes to it are refused. */
const AREA_IDS = ["work", "msg", "ceochat", "notes", "proj", "people", "metrics", "dec", "money", "figures", "wages", "fund", "legal", "mynotes", "mycal"];
const DEFAULT_ROLES = [
  { name: "CTO", base: "Manager", areas: ["work", "msg", "notes", "proj", "people", "metrics", "dec"] },
  { name: "CFO", base: "Manager", areas: ["work", "msg", "notes", "people", "metrics", "dec", "money", "wages", "fund", "legal"] },
  { name: "Head of Product", base: "Manager", areas: ["work", "msg", "notes", "proj", "people", "metrics", "dec"] },
  { name: "Lead Engineer", base: "Manager", areas: ["work", "msg", "notes", "proj", "people"] },
  { name: "Marketing Lead", base: "Member", areas: ["work", "msg", "notes", "proj", "people", "metrics"] },
  { name: "Ops", base: "Member", areas: ["work", "msg", "notes", "proj", "people", "legal"] },
  { name: "Dev", base: "Member", areas: ["work", "msg", "notes", "proj"] },
  // Investors: the headline money figures, one conversation (with the CEO), a private notepad and their own calendar.
  // Nothing about staff.
  { name: "VC", base: "Guest", areas: ["figures", "ceochat", "mynotes", "mycal"] },
  { name: "Guest", base: "Guest", areas: ["msg", "proj"] },
];
// Role names used before; accounts that still have one keep working with the role it became.
const OLD_ROLES = { Finance: "CFO", Marketing: "Marketing Lead", Engineering: "Lead Engineer", Manager: "Head of Product", Member: "Dev", Investor: "VC" };
// Which saved parts belong to which area. Parts not listed (people, spaces, settings) follow the level alone.
const SEC_AREAS = {
  TASKS: ["work", "proj"], CEV: ["work"], WK: ["work", "metrics"], NOTES: ["notes"], PROJ: ["proj"], SIDEP: ["proj"], STGS: ["proj"],
  TEAMP: ["people"], ANN: ["people"], MROWS: ["metrics"], MET: ["metrics"], SO: ["dec"], dec: ["dec"], DECLOG: ["dec"],
  MNY_B: ["money"], MNY_BL: ["money"], MNY_acc: ["money", "figures"], MNY_tx: ["money"], MNYn: ["money", "figures"], TOK: ["money"], // figures = cash and burn only
  INV: ["fund"], SAFES: ["fund"], CAP: ["fund"], DR: ["fund"], ROUND: ["fund"], UPD: ["fund"], TS: ["fund"],
  LG_meet: ["legal"], LG_mem: ["legal"], LG_fil: ["legal"], LG_ct: ["legal"],
};
// Areas where being given access also means being able to make changes (money, fundraising, legal, metrics, decisions).
const WRITE_GRANT = new Set(["money", "fund", "legal", "metrics", "dec"]);
const roleDefs = () => { const r = readSec("RDEF"); return Array.isArray(r) && r.length ? r : DEFAULT_ROLES; };
// A role name nobody recognises gets the least access: messages with the CEO, view only.
const roleDef = (name) => roleDefs().find((x) => x.name === (OLD_ROLES[name] && !roleDefs().some((r) => r.name === name) ? OLD_ROLES[name] : name)) || DEFAULT_ROLES.find((x) => x.name === (OLD_ROLES[name] || name)) || { name, base: "Guest", areas: ["ceochat"] };
const baseOf = (name) => (name === "CEO" ? "CEO" : roleDef(name)?.base || "Member");
// A signed-in person: u.job is their job role, u.role their level (used by every check), u.areas what they see.
function withRole(u) {
  if (!u) return u; u.job = u.role;
  if (u.role === "CEO") { u.areas = AREA_IDS; return u; }
  const d = roleDef(u.role); u.role = d.base; u.areas = d.areas || []; return u;
}
function mayRead(sec, u) {
  const ar = SEC_AREAS[sec]; if (u.role === "CEO" || !ar) return canRead(sec, u.role);
  if (!ar.some((a) => u.areas.includes(a))) return false;
  // View-only roles read the areas they're given, except the project list and stages (they see shared projects only).
  return u.role === "Guest" && ["PROJ", "SIDEP", "STGS"].includes(sec) ? canRead(sec, "Guest") : true;
}
function mayWrite(sec, u) {
  const ar = SEC_AREAS[sec]; if (u.role === "CEO" || !ar) return canWrite(sec, u.role);
  const g = ar.filter((a) => u.areas.includes(a)); if (!g.length) return false;
  return canWrite(sec, u.role) || (u.role !== "Guest" && g.some((a) => WRITE_GRANT.has(a)));
}
const jobNames = () => roleDefs().map((x) => x.name);
const FILE_AREA = { space: ALL, legal: CEO, dataroom: CEO, wages: CEO, project: STAFF, dm: ALL };
// Wages files follow wages access: Managers the CEO lets see wages can open them; only the CEO adds them.
const FILE_GRANT = { legal: "legal", dataroom: "fund" };
const canFile = (area, u, write) => area === "wages" && !write ? wagesOK(u) : !!FILE_AREA[area]?.includes(u.role) || (!!FILE_GRANT[area] && u.areas?.includes(FILE_GRANT[area]));

/* ---------------- Checking what people send before it is saved ----------------
   Nothing that looks like HTML is stored in names, titles, ids or labels, and each
   field is held to the shape and length the app uses. The app also escapes on display. */
const noTags = (v, max = 200) => String(v ?? "").replace(/[<>]/g, "").slice(0, max);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/, TASK_ID_RE = /^[A-Z]{2,6}-\d{1,6}$/, DATE_RE = /^\d{4}-\d\d-\d\d$/, TIME_RE = /^[A-Za-z0-9 :.,'·-]{0,24}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const colorTok = (v) => (typeof v === "string" && /^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]+\)|[a-z]+)$/.test(v) ? v : "var(--soft)");
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
function cleanRx(rx) {
  const out = {}; if (!rx || typeof rx !== "object") return out;
  for (const [k, n] of Object.entries(rx).slice(0, 12)) { const e = String(k).replace(/[<>"'&`\s]/g, "").slice(0, 8); if (e) out[e] = Math.max(0, Math.min(9999, n | 0)); }
  return out;
}
function cleanMsgExtra(x) {
  const o = {}; if (!x || typeof x !== "object") return o;
  if (x.rx) o.rx = cleanRx(x.rx);
  if (x.file) o.file = noTags(x.file, 200);
  if (isId(x.fid)) o.fid = x.fid;
  if (typeof x.url === "string" && /^\/api\/files\/[a-f0-9]{32}$/.test(x.url)) o.url = x.url; // a file sent in a direct message
  if (x.g) o.g = noTags(x.g, 60);
  if (x.reply && typeof x.reply === "string") o.reply = noTags(x.reply, 40);
  return o;
}
// Caps sizes everywhere so one request can't store unbounded data.
function clamp(v, depth = 0) {
  if (depth > 10) return null;
  if (typeof v === "string") return v.slice(0, 20000);
  if (Array.isArray(v)) return v.slice(0, 5000).map((x) => clamp(x, depth + 1));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v).slice(0, 2000)) o[String(k).slice(0, 80)] = clamp(x, depth + 1); return o; }
  return typeof v === "number" || typeof v === "boolean" || v === null ? v : null;
}
const TASK_S = ["todo", "prog", "review", "sign", "done"];
function cleanTask(t) {
  if (!t || typeof t !== "object" || !TASK_ID_RE.test(String(t.id))) return null;
  const o = { id: t.id, t: noTags(t.t, 300), l: noTags(t.l, 30), o: isId(t.o) ? t.o : null, p: Math.max(0, Math.min(4, t.p | 0)), d: noTags(t.d, 20), s: TASK_S.includes(t.s) ? t.s : "todo" };
  if (t.w && TASK_ID_RE.test(String(t.w))) o.w = t.w;
  if (isId(t.nx)) o.nx = t.nx;
  for (const k of ["mv", "ho", "ch", "due"]) if (typeof t[k] === "string" && DATE_RE.test(t[k])) o[k] = t[k];
  // A task saved with only a label ("Fri", "Today", "Apr 20") gets its full date now, so it can go late later.
  if (!o.due) { const d = dueISO(o.d); if (d) o.due = d; }
  return o;
}
// Members can add tasks and change their own; only managers and the CEO can change or remove other people's.
function mergeTasks(incoming, u) {
  const clean = (Array.isArray(incoming) ? incoming : []).map(cleanTask).filter(Boolean);
  if (u.role === "CEO" || u.role === "Manager") return clean;
  const cur = (readSec("TASKS") || []).map((t) => cleanTask(t) || t), byId = new Map(clean.map((t) => [t.id, t]));
  const out = cur.map((t) => (t.o === u.pkey && byId.has(t.id) ? byId.get(t.id) : t)).filter((t) => t.o !== u.pkey || byId.has(t.id));
  const known = new Set(cur.map((t) => t.id));
  for (const t of clean) if (!known.has(t.id)) out.push(t);
  return out;
}
// Calendar: private rows (investor, legal, the CEO's Google Calendar) are only touched by the CEO.
// Everyone else can add events and change or remove only the events they added.
const CEV_K = ["meet", "inv", "legal", "launch", "due"];
const isPrivateEv = (e) => e[2] === "inv" || e[2] === "legal" || e[4] === "google";
function cleanEv(e) {
  if (!Array.isArray(e) || !DATE_RE.test(String(e[0]))) return null;
  const r = [e[0], noTags(e[1], 120), CEV_K.includes(e[2]) ? e[2] : "meet", noTags(e[3], 80)];
  if (e[4] !== undefined || e[5] !== undefined) r.push(e[4] === undefined || e[4] === null ? "" : noTags(e[4], 20));
  if (isId(e[5])) r.push(e[5]);
  if (e[6] === "vc") { while (r.length < 6) r.push(""); r[6] = "vc"; } // shared with investors
  return r;
}
function mergeCev(incoming, u) {
  const clean = (Array.isArray(incoming) ? incoming : []).map(cleanEv).filter(Boolean);
  if (u.role === "CEO") return clean;
  const cur = readSec("CEV") || [], keyOf = (e) => JSON.stringify(e.slice(0, 4));
  const curKeys = new Set(cur.map(keyOf));
  const keep = cur.filter((e) => isPrivateEv(e) || (u.role !== "Manager" && e[5] !== u.pkey));
  const mine = clean.filter((e) => !isPrivateEv(e) && (u.role === "Manager" || e[5] === u.pkey || !curKeys.has(keyOf(e))))
    .map((e) => { const r = e.slice(0, 4); r[2] = r[2] === "inv" || r[2] === "legal" ? "meet" : r[2]; r[4] = e[4] === "google" ? "" : (e[4] || ""); r[5] = e[5] && curKeys.has(keyOf(e)) ? e[5] : u.pkey;
      const was = cur.find((x) => keyOf(x) === keyOf(e)); if (was?.[6] === "vc") r[6] = "vc"; return r; }); // only the CEO decides what investors see
  return [...keep, ...mine];
}
/* ---------------- Private notes and calendars (investors) ----------------
   Kept per account, apart from the team's notes and calendar. Only the person who wrote them can read them back:
   nothing here is ever in /api/state, live updates or anyone else's request, the CEO's included. */
db.exec("CREATE TABLE IF NOT EXISTS mine(user_id INTEGER, kind TEXT, json TEXT, updated INTEGER, PRIMARY KEY(user_id, kind))");
const readMine = (uid, kind) => { const r = q("SELECT json FROM mine WHERE user_id=? AND kind=?").get(uid, kind); return r ? JSON.parse(r.json) : []; };
const writeMine = (uid, kind, v) => q("INSERT INTO mine(user_id,kind,json,updated) VALUES(?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET json=excluded.json,updated=excluded.updated").run(uid, kind, JSON.stringify(v), Date.now());
const MINE_ID = /^[A-Za-z0-9_-]{4,40}$/;
const mineId = (v) => (MINE_ID.test(String(v)) ? String(v) : "m" + randomBytes(6).toString("hex"));
const cleanMyNote = (n) => n && typeof n === "object" ? { id: mineId(n.id), t: noTags(n.t, 200), b: String(n.b ?? "").slice(0, 20000), u: Math.max(0, +n.u || Date.now()) } : null;
const cleanMyEv = (e) => e && typeof e === "object" && DATE_RE.test(String(e.d)) ? { id: mineId(e.id), d: e.d, t: noTags(e.t, 120), tm: /^\d\d:\d\d$/.test(e.tm) ? e.tm : "", n: String(e.n ?? "").slice(0, 2000) } : null;
// Events the CEO shares with investors: title, date and time only. Where it is and who is invited never leave.
function syncShared() {
  const list = (readSec("CEV") || []).filter((e) => e[6] === "vc" && e[4] !== "google")
    .map((e) => ({ id: "s" + sha(e[0] + "|" + e[1]).slice(0, 16), d: e[0], t: noTags(e[1], 120), tm: (/^(\d\d:\d\d)/.exec(String(e[3] || "")) || [])[1] || "" }));
  if (JSON.stringify(list) === JSON.stringify(readSec("VSHARE") || [])) return;
  writeSec("VSHARE", list, null); // not in ACL: never sent by /api/state, only by /api/mine/cal
  broadcast({ type: "changed", sections: ["VCAL"], by: "sys" }, (x) => x.areas?.includes("mycal"));
}

// Space files: people only change the file lists of spaces they are in, and members only add or remove their own files.
function cleanFile(f) {
  if (!f || typeof f !== "object") return null;
  const url = typeof f.url === "string" && /^\/api\/files\/[a-f0-9]{32}$/.test(f.url) ? f.url : "";
  return { id: isId(f.id) ? f.id : "f" + randomBytes(6).toString("hex"), n: noTags(f.n, 200), kind: ["video", "image", "pdf", "sheet", "doc", "text", "other"].includes(f.kind) ? f.kind : "other", by: isId(f.by) ? f.by : "", when: noTags(f.when, 24), size: noTags(f.size, 24), url, ext: noTags(f.ext, 5), mime: noTags(f.mime, 80) };
}
function mergeSpx(incoming, u) {
  const cur = readSec("SPX") || {}, convs = readSec("CONVS") || [];
  if (!incoming || typeof incoming !== "object") return cur;
  for (const [k, list] of Object.entries(incoming)) {
    const conv = convs.find((c) => c.ch && c.id === k);
    if (!conv || !canSeeConv(conv, u) || !Array.isArray(list)) continue;
    const clean = list.slice(0, 500).map(cleanFile).filter(Boolean);
    if (u.role === "CEO" || u.role === "Manager") { cur[k] = clean; continue; }
    const old = Array.isArray(cur[k]) ? cur[k] : [];
    cur[k] = [...old.filter((f) => f.by !== u.pkey), ...clean.filter((f) => f.by === u.pkey)];
  }
  return cur;
}
function cleanSection(k, v) {
  v = clamp(v);
  // Job roles: a name, a level and the areas they see.
  if (k === "RDEF") { const seen = new Set(); return (Array.isArray(v) ? v : []).slice(0, 30).map((r) => ({ name: noTags(r?.name, 30).trim(), base: ["Manager", "Member", "Guest"].includes(r?.base) ? r.base : "Member", areas: (Array.isArray(r?.areas) ? r.areas : []).filter((a) => AREA_IDS.includes(a)) })).filter((r) => r.name && r.name !== "CEO" && !seen.has(r.name) && seen.add(r.name)); }
  // Workspace currency: a known code and sensible fixed rates (per US dollar).
  if (k === "CUR") { const codes = ["USD", "GBP", "EUR"], o = { code: codes.includes(v?.code) ? v.code : "GBP", rates: { USD: 1 } }; for (const c of ["GBP", "EUR"]) { const r = +v?.rates?.[c]; if (r > 0.01 && r < 100) o.rates[c] = r; } return o; }
  // Token spend by API key: [name, masked key, model, dollars this month], plus six monthly totals.
  if (k === "TOK" && v && typeof v === "object") return { sample: !!v.sample, keys: (Array.isArray(v.keys) ? v.keys : []).slice(0, 50).filter(Array.isArray).map((x) => [noTags(x[0], 80), noTags(x[1], 40), noTags(x[2], 60), Math.max(0, +x[3] || 0)]), months: (Array.isArray(v.months) ? v.months : []).slice(-12).map((n) => Math.max(0, +n || 0)) };
  if (k === "P" && v && typeof v === "object") { const o = {}; for (const [pk, x] of Object.entries(v)) if (isId(pk) && Array.isArray(x)) o[pk] = [noTags(x[0], 80), colorTok(x[1]), colorTok(x[2])]; return o; }
  if (k === "stamps" && v && typeof v === "object") { const o = {}; for (const [id, x] of Object.entries(v)) if (isId(id) && Array.isArray(x)) o[id] = [noTags(x[0], 40), noTags(x[1], 40)]; return o; }
  if (k === "cnt" && v && typeof v === "object") { const o = {}; for (const [id, x] of Object.entries(v)) o[noTags(id, 40)] = typeof x === "number" ? x : clamp(x); return o; }
  return v;
}

/* ---------------- Section storage ---------------- */
const readSec = (name) => { const r = q("SELECT json FROM sections WHERE name=?").get(name); return r ? JSON.parse(r.json) : undefined; };
const writeSec = (name, val, uid) => q("INSERT INTO sections(name,json,updated,by) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET json=excluded.json,updated=excluded.updated,by=excluded.by").run(name, JSON.stringify(val), Date.now(), uid);
// Once: investors get the private notepad and calendar on workspaces saved before they existed.
if (!getSetting("roles-v5")) { const r = readSec("RDEF"); if (Array.isArray(r)) { const vc = r.find((x) => x.name === "VC"); if (vc) { vc.areas = [...new Set([...(vc.areas || []), "mynotes", "mycal"])]; writeSec("RDEF", r, null); } } setSetting("roles-v5", "1"); }

// Each person's own key is shown to their browser as "AK" (the front end's "me"),
// and the real "AK" gets their key. Applied on the way out and undone on the way in.
function swapKeys(v, a, b) {
  if (a === b) return v;
  if (typeof v === "string") return v === a ? b : v === b ? a : v;
  if (Array.isArray(v)) return v.map((x) => swapKeys(x, a, b));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k === a ? b : k === b ? a : k] = swapKeys(x, a, b); return o; }
  return v;
}
const convMembers = (c) => (c.ch ? c.mem || [] : c.parts || ["AK", c.dm]);
const canSeeConv = (c, u) => (c.ch ? !c.mem || c.mem.includes(u.pkey) || u.role === "CEO" && !c.parts : convMembers(c).includes(u.pkey));

// Chat scope: "all" (spaces and messages), "ceo" (only a conversation with the CEO) or "none".
const ceoPkey = () => q("SELECT pkey FROM users WHERE role='CEO' LIMIT 1").get()?.pkey || "AK";
const chatScope = (u) => (u.role === "CEO" || u.areas?.includes("msg") ? "all" : u.areas?.includes("ceochat") ? "ceo" : "none");
const chatAllowed = (c, u) => { const sc = chatScope(u); if (sc === "all") return true; if (sc === "none" || c.ch) return false; const m = convMembers(c); return m.length === 2 && m.includes(u.pkey) && m.includes(ceoPkey()); };
function convsFor(u) {
  const all = readSec("CONVS") || [];
  return all.filter((c) => canSeeConv(c, u) && chatAllowed(c, u)).map((c) => {
    if (c.ch) return c;
    const other = convMembers(c).find((k) => k !== u.pkey) || c.dm;
    const unread = (c.unreadBy || {})[u.pkey] || 0;
    return { ...c, dm: other, id: other, parts: undefined, unreadBy: undefined, unread };
  });
}
// Merge one person's copy of the conversations into the shared copy without
// losing anyone else's messages. People can only add their own messages.
function canCreateSpace(u) {
  if (u.role === "CEO") return true; if (u.role === "Guest") return false;
  const rule = (readSec("SPSET") || {}).create || "Managers and CEO";
  return rule === "Everyone" || (rule === "Managers and CEO" && u.role === "Manager");
}
// The CEO's first save seeds the sample spaces and messages; it goes through the same checks.
function cleanSeedConvs(v) {
  return (Array.isArray(v) ? v : []).slice(0, 500).filter((c) => c && (c.ch ? isId(c.id) && !String(c.id).startsWith("dm_") : isId(c.dm))).map((c) => {
    const ic = Array.isArray(c.ic) ? c.ic : [];
    const base = c.ch ? { id: c.id, ch: noTags(c.ch, 80), ic: [noTags(ic[0], 2), colorTok(ic[1]), colorTok(ic[2])], desc: noTags(c.desc, 300), shared: c.shared ? noTags(c.shared, 80) : undefined, guests: Array.isArray(c.guests) ? c.guests.slice(0, 50).map((g) => noTags(g, 60)) : undefined, by: isId(c.by) ? c.by : undefined, mem: Array.isArray(c.mem) ? c.mem.filter(isId) : undefined, last: DATE_RE.test(String(c.last)) ? c.last : undefined }
      : { id: c.dm, dm: c.dm, parts: Array.isArray(c.parts) ? c.parts.filter(isId) : undefined };
    base.unread = c.unread | 0;
    base.msgs = (Array.isArray(c.msgs) ? c.msgs : []).slice(0, 2000).filter(Array.isArray).map((m) => [isId(m[0]) || m[0] === "sys" || m[0] === "guest" ? m[0] : "sys", TIME_RE.test(String(m[1])) ? String(m[1]) : "", String(m[2] ?? "").slice(0, 8000), cleanMsgExtra(m[3])]);
    return base;
  });
}
// Who can manage a space (archive it, remove other people): its creator, managers and the CEO.
const canManageSpace = (cur, u) => u.role === "CEO" || u.role === "Manager" || (cur.by && cur.by === u.pkey);
const nameOf = (pk) => { const r = q("SELECT name FROM users WHERE pkey=?").get(pk); if (r && r.name) return String(r.name).split(" ")[0]; const P = readSec("P") || {}; return P[pk] ? String(P[pk][0]).split(" ")[0] : "Someone"; };
const today = () => new Date().toISOString().slice(0, 10);
const sysMsg = (cur, text) => { cur.msgs.push(["sys", nowHM(), text, {}]); };

function mergeConvs(incoming, u) {
  const all = readSec("CONVS") || [];
  // Spaces and direct messages live in separate lookups, so a space can never be mistaken for a DM (or the other way round).
  const chans = new Map(all.filter((c) => c.ch).map((c) => [c.id, c]));
  const dmKey = (a, b) => [a, b].sort().join("|");
  const dms = new Map(all.filter((c) => !c.ch).map((c) => [convMembers(c).slice().sort().join("|"), c]));
  const key = (m) => JSON.stringify([m[0], m[1], m[2]]);
  for (const c of incoming || []) {
    if (!c || typeof c !== "object") continue;
    let cur;
    if (c.ch) {
      if (chatScope(u) !== "all") continue; // no spaces for people limited to the CEO
      if (!isId(c.id) || c.id.startsWith("dm_")) continue; // never trust the id: it must be a plain space id
      cur = chans.get(c.id);
      if (!cur) {
        if (!canCreateSpace(u)) continue; // the CEO decides who can create spaces
        const ic = Array.isArray(c.ic) ? c.ic : [];
        cur = { id: c.id, ch: noTags(c.ch, 80), ic: [noTags(ic[0], 2), colorTok(ic[1]), colorTok(ic[2])], desc: noTags(c.desc, 300), shared: c.shared ? noTags(c.shared === true ? "Shared" : c.shared, 80) : undefined, guests: Array.isArray(c.guests) ? c.guests.slice(0, 50).map((g) => noTags(g, 60)) : undefined, by: u.pkey, made: today(), last: today(), mem: Array.from(new Set([...(Array.isArray(c.mem) ? c.mem.filter(isId) : []), u.pkey])), unread: 0, msgs: [] };
        sysMsg(cur, `${nameOf(u.pkey)} created this space`);
        all.push(cur); chans.set(cur.id, cur);
      } else if (!canSeeConv(cur, u)) continue; // only people in the space can change it
    } else {
      if (!isId(c.dm) || c.dm === u.pkey) continue;
      if (chatScope(u) === "none" || (chatScope(u) === "ceo" && c.dm !== ceoPkey())) continue; // e.g. investors only talk to the CEO
      cur = dms.get(dmKey(u.pkey, c.dm));
      if (!cur) { cur = { id: "dm_" + [u.pkey, c.dm].sort().join("_"), dm: c.dm, parts: [u.pkey, c.dm], unread: 0, unreadBy: {}, msgs: [] }; all.push(cur); dms.set(dmKey(u.pkey, c.dm), cur); }
      else if (!convMembers(cur).includes(u.pkey)) continue;
    }
    if (c.ch && Array.isArray(c.mem) && (cur.mem || []).includes(u.pkey) && u.role !== "Guest") {
      // Anyone in the space can add people. Removing someone else needs the creator, a manager or the CEO; anyone can leave.
      const next = new Set(c.mem.filter(isId)), was = new Set(cur.mem || []);
      const added = [...next].filter((k) => !was.has(k));
      const removed = [...was].filter((k) => !next.has(k) && (k === u.pkey || canManageSpace(cur, u)));
      if (added.length || removed.length) {
        cur.mem = [...[...was].filter((k) => !removed.includes(k)), ...added];
        if (added.length) sysMsg(cur, `${nameOf(u.pkey)} added ${added.map(nameOf).join(", ")}`);
        for (const k of removed) sysMsg(cur, k === u.pkey ? `${nameOf(k)} left` : `${nameOf(u.pkey)} removed ${nameOf(k)}`);
      }
    }
    // Archive and keep: same people who can manage the space. The server writes the notice, once.
    if (c.ch && canManageSpace(cur, u)) {
      const want = typeof c.arch === "string" && DATE_RE.test(c.arch);
      if (want && !cur.arch) { cur.arch = today(); delete cur.archAuto; delete cur.flag; sysMsg(cur, `${nameOf(u.pkey)} archived this space`); }
      else if (!want && cur.arch && c.arch === undefined && c.reopen) { delete cur.arch; delete cur.archAuto; delete cur.flag; cur.last = today(); sysMsg(cur, `${nameOf(u.pkey)} reopened this space`); }
      if (!c.flag && cur.flag && c.keep) { delete cur.flag; cur.last = today(); }
    }
    const have = new Set(cur.msgs.map(key)); let added = 0;
    for (const m of c.msgs || []) {
      if (!Array.isArray(m)) continue;
      const k = key(m);
      if (have.has(k)) { const ex = cur.msgs.find((x) => key(x) === k); if (m[3] && m[3].rx) { ex[3] = ex[3] || {}; ex[3].rx = cleanRx(m[3].rx); } continue; }
      if (m[0] !== u.pkey) continue; // people only post as themselves; system notices come from the server
      if (++added > NEW_MSGS_MAX) break;
      cur.msgs.push([m[0], TIME_RE.test(String(m[1])) ? String(m[1]) : nowHM(), String(m[2]).slice(0, MSG_MAX), cleanMsgExtra(m[3])]);
      have.add(k);
      if (cur.ch) { cur.last = today(); delete cur.flag; if (cur.arch) { delete cur.arch; delete cur.archAuto; sysMsg(cur, "Space reopened because someone posted"); } }
      if (!cur.ch) { cur.unreadBy = cur.unreadBy || {}; for (const p of convMembers(cur)) if (p !== u.pkey) cur.unreadBy[p] = (cur.unreadBy[p] || 0) + 1; }
      else for (const p of cur.mem || []) if (p !== u.pkey) { cur.unreadBy = cur.unreadBy || {}; cur.unreadBy[p] = (cur.unreadBy[p] || 0) + 1; }
    }
    if ((c.unread | 0) === 0 && cur.unreadBy) cur.unreadBy[u.pkey] = 0;
    if (cur.msgs.length > MSGS_KEPT) cur.msgs.splice(0, cur.msgs.length - MSGS_KEPT); // each conversation keeps its latest messages
  }
  if (tooBig("CONVS", all)) return false;
  writeSec("CONVS", all, u.id); return true;
}

// Spaces with no posts for 30 days are flagged; 7 days later they archive themselves. Runs on the server only, so it happens once.
function tidySpaces() {
  const all = readSec("CONVS"); if (!all) return; const t = today(); let changed = false;
  const days = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 864e5);
  for (const c of all) {
    if (!c.ch || c.arch || !c.last) continue;
    const idle = days(c.last, t);
    if (idle < 30) { if (c.flag) { delete c.flag; changed = true; } continue; }
    if (!c.flag) { c.flag = t; changed = true; }
    else if (days(c.flag, t) >= 7) { c.arch = t; c.archAuto = true; delete c.flag; sysMsg(c, `Archived automatically after ${idle} days without posts`); changed = true; }
  }
  if (changed) { writeSec("CONVS", all, null); broadcast({ type: "changed", sections: ["CONVS"], by: "sys" }); }
}

function stateFor(u) {
  const out = {};
  for (const r of q("SELECT name,json FROM sections").all()) {
    if (r.name === "CONVS" || !mayRead(r.name, u)) continue;
    out[r.name] = JSON.parse(r.json);
  }
  out.CONVS = convsFor(u).map((c) => (c.ch ? { ...c, unread: (c.unreadBy || {})[u.pkey] || 0, unreadBy: undefined } : c));
  // Roles come from accounts, not from what a browser sent.
  if (out.MEM) out.MEM = out.MEM.map((m) => { const acc = q("SELECT role FROM users WHERE pkey=?").get(m[0]); return acc ? [m[0], acc.role] : m; });
  if (out.SPX && u.role !== "CEO") { const mine = new Set(convsFor(u).filter((c) => c.ch).map((c) => c.id)); out.SPX = Object.fromEntries(Object.entries(out.SPX).filter(([k]) => mine.has(k))); }
  // No staff details for people outside the team (e.g. investors): only their own name and the CEO's.
  if (u.role !== "CEO" && !u.areas.includes("msg") && !u.areas.includes("people")) {
    const keep = new Set([u.pkey, ceoPkey()]);
    if (out.P) out.P = Object.fromEntries(Object.entries(out.P).filter(([k]) => keep.has(k)));
    if (out.MEM) out.MEM = out.MEM.filter((m) => keep.has(m[0]));
    for (const k of ["stamps", "cnt", "SPX", "TEAMP", "ANN", "WG"]) delete out[k];
  }
  // Guests only see the tasks they own, not the whole company's work.
  if (u.role === "Guest" && out.TASKS) out.TASKS = out.TASKS.filter((t) => t.o === u.pkey);
  if (u.role !== "CEO" && out.CEV) out.CEV = out.CEV.filter((e) => e[2] !== "inv" && e[2] !== "legal" && e[4] !== "google"); // the CEO's own Google Calendar stays private
  const res = swapKeys(out, "AK", u.pkey);
  const vers = q("SELECT name, updated, by FROM sections").all().filter((r) => r.name in res);
  res.__v = Object.fromEntries(vers.map((r) => [r.name, r.updated]));
  res.__mine = vers.filter((r) => r.by === u.id).map((r) => r.name); // parts this person saved last
  return res;
}

/* ---------------- Accounts and sessions ---------------- */
async function hashPw(pw) { const salt = randomBytes(16); const h = await scrypt(pw, salt, 64); return salt.toString("hex") + ":" + h.toString("hex"); }
async function checkPw(pw, stored) { if (!stored) { DUMMY_PW ??= await hashPw(randomBytes(12).toString("hex")); await checkPw(pw, DUMMY_PW); return false; } const [s, h] = stored.split(":"); const got = await scrypt(pw, Buffer.from(s, "hex"), 64); return timingSafeEqual(got, Buffer.from(h, "hex")); }
const SESSION_MS = 12 * 3600e3, DEVICE_DAYS = 365, RESET_MINUTES = 60, LINK_DAYS = 7, PIN_TRIES = 5;
const INVITE_DAYS = 7;
// The address people use to reach Helm. PUBLIC_URL (your custom domain) wins; otherwise the address of this request.
const publicOrigin = (url) => (process.env.PUBLIC_URL || url.origin).replace(/\/$/, "");
// Sessions past their date are removed, not just ignored.
const dropOldSessions = () => { const now = Date.now(); q("DELETE FROM sessions WHERE expires < ?").run(now); q("DELETE FROM devices WHERE last < ?").run(now - DEVICE_DAYS * 864e5); q("DELETE FROM signins WHERE at < ?").run(now - 30 * 864e5); q("DELETE FROM help WHERE at < ?").run(now - 7 * 864e5); };
dropOldSessions(); setInterval(dropOldSessions, 60 * 60e3).unref();
const signOutAll = (uid, keepDevices) => { q("DELETE FROM sessions WHERE user_id=?").run(uid); if (!keepDevices) q("DELETE FROM devices WHERE user_id=?").run(uid); for (const c of clients) if (c.user.id === uid) { try { c.res.end(); } catch {} clients.delete(c); } };
const inviteOK = (x) => x && x.invite && (x.created || 0) + INVITE_DAYS * 864e5 > Date.now();
// First-run setup needs a code, so nobody who finds a fresh install first can take it over.
// Set SETUP_CODE yourself, or read the one printed in the server log. Once set up, setup stays closed for good.
if (q("SELECT 1 FROM users LIMIT 1").get()) setSetting("setup_done", "1");
const setupOpen = () => !getSetting("setup_done") && !q("SELECT 1 FROM users LIMIT 1").get();
const SETUP_CODE = String(process.env.SETUP_CODE || randomBytes(5).toString("hex")).trim();
if (setupOpen()) console.log(`First-run setup code: ${process.env.SETUP_CODE ? "(the SETUP_CODE you set)" : SETUP_CODE}`);
function newSession(uid) { const t = randomBytes(32).toString("hex"); q("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(createHash("sha256").update(t).digest("hex"), uid, Date.now() + SESSION_MS); return t; }
function userFrom(req) {
  const m = /(?:^|;\s*)helm_s=([a-f0-9]{64})/.exec(req.headers.cookie || ""); if (!m) return null;
  const r = q("SELECT u.* , s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?").get(createHash("sha256").update(m[1]).digest("hex"));
  if (!r || r.expires < Date.now() || r.blocked) return null; return withRole(r);
}
const secure = (req) => (process.env.COOKIE_SECURE === "1" || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "");
const cookie = (req, t, maxAge) => `helm_s=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req)}`;
const sha = (t) => createHash("sha256").update(String(t)).digest("hex");
// A device someone has signed in on before. Its cookie is only sent to /api.
const deviceOf = (req) => { const m = /(?:^|;\s*)helm_d=([a-f0-9]{64})/.exec(req.headers.cookie || ""); return m ? q("SELECT * FROM devices WHERE token=?").get(sha(m[1])) : null; };
function deviceName(req) {
  const ua = String(req.headers["user-agent"] || "");
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const o = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b} on ${o}` : b;
}
// Signing someone in: a session, plus remembering this device. Wrong guesses from elsewhere never lock out a remembered
// device, and a sign-in from a new device is shown on the person's other devices so they can stop it.
function signIn(req, uid, how) {
  const known = deviceOf(req), now = Date.now(), cookies = [cookie(req, newSession(uid), SESSION_MS / 1000)];
  if (known && known.user_id === uid) q("UPDATE devices SET last=? WHERE token=?").run(now, known.token);
  else {
    const d = randomBytes(32).toString("hex"); q("INSERT INTO devices(token,user_id,created,last) VALUES(?,?,?,?)").run(sha(d), uid, now, now);
    cookies.push(`helm_d=${d}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${DEVICE_DAYS * 86400}${secure(req)}`);
    const via = { link: " · with a sign-in link", join: " · with a sign-in link", pin: "", google: " · with Google", passkey: " · with a passkey", password: "" };
    if (how in via) q("INSERT INTO signins(user_id,at,what) VALUES(?,?,?)").run(uid, now, deviceName(req) + via[how]);
  }
  q("DELETE FROM help WHERE user_id=?").run(uid);
  return { "set-cookie": cookies };
}
/* ---------------- Plans ---------------- */
const PLANS = [{ seats: 5, price: 59.99 }, { seats: 10, price: 119.99 }, { seats: 20, price: 215.99 }, { seats: 30, price: 299.99 }];
db.exec("CREATE TABLE IF NOT EXISTS quotes(id INTEGER PRIMARY KEY, at INTEGER, user_id INTEGER, seats INTEGER, email TEXT, note TEXT)");
const seatsUsed = () => q("SELECT COUNT(*) AS n FROM users WHERE COALESCE(blocked,0)=0").get().n;
const planInfo = () => { const seats = PLANS.some((x) => x.seats === +getSetting("plan")) ? +getSetting("plan") : 5; const quote = q("SELECT at, seats FROM quotes ORDER BY at DESC LIMIT 1").get(); return { plan: PLANS.find((x) => x.seats === seats), used: seatsUsed(), plans: PLANS, quote: quote || null }; };

/* ---------------- PINs ----------------
   Six digits, set by the workspace owner. Only a device that was set up with the owner's link can try a PIN, so
   nobody else can guess at it or lock anyone out. Five wrong PINs pause that one person until the owner gives them a
   new PIN; everyone else carries on. Nothing here is a password, and there's no reset queue: the owner handles it. */
const weakPin = (p) => /^(\d)\1{5}$/.test(p) || "0123456789012".includes(p) || "9876543210987".includes(p) || /^(\d\d)\1\1$/.test(p) || /^(\d\d\d)\1$/.test(p);
const validPin = (p) => typeof p === "string" && /^\d{6}$/.test(p) && !weakPin(p);
const PIN_RULE = "Use 6 digits that aren’t easy to guess (not 123456, 111111 or 121212).";
const newPin = () => { let p; do p = String(randomInt(0, 1e6)).padStart(6, "0"); while (weakPin(p)); return p; };
const ownerFirst = () => String(q("SELECT name FROM users WHERE role='CEO' LIMIT 1").get()?.name || "your workspace owner").split(" ")[0];
// A one-time link that sets up a device. Good for a week; opening it still needs the PIN.
function newLink(uid, url) { const t = randomBytes(24).toString("hex"); q("UPDATE users SET link=?, link_at=? WHERE id=?").run(sha(t), Date.now(), uid); return `${publicOrigin(url)}/join?t=${t}`; }
const linkUser = (t) => { const x = t && q("SELECT * FROM users WHERE link=?").get(sha(String(t))); return x && (x.link_at || 0) + LINK_DAYS * 864e5 > Date.now() ? x : null; };
// Checks a PIN for one person. Returns null when right, or the message to show.
async function pinCheck(x, pin) {
  if (x.blocked) return { status: 403, error: `Your access is turned off. Talk to ${ownerFirst()}.` };
  if (x.locked) return { status: 423, error: `Too many wrong PINs, so your access is paused. Ask ${ownerFirst()} for a new PIN.` };
  if (!x.pin) return { status: 403, error: `You don’t have a PIN yet. Ask ${ownerFirst()} for one.` };
  if (await checkPw(String(pin || "").slice(0, 12), x.pin)) { q("UPDATE users SET pin_fails=0 WHERE id=?").run(x.id); return null; }
  const fails = (x.pin_fails || 0) + 1, lock = fails >= PIN_TRIES;
  q("UPDATE users SET pin_fails=?, locked=? WHERE id=?").run(fails, lock ? 1 : 0, x.id);
  if (lock) { signOutAll(x.id, true); audit(x.id, "access paused after too many wrong PINs"); return { status: 423, error: `That PIN is wrong again, so your access is paused. Ask ${ownerFirst()} for a new PIN.` }; }
  const left = PIN_TRIES - fails; return { status: 401, error: `That PIN is wrong. ${left} ${left === 1 ? "try" : "tries"} left.` };
}
// When someone locked out can try again (the oldest counted try leaves the window).
const retryAt = (keys) => Math.max(...keys.map((k) => { const t = recent(k), lim = k.startsWith("e:") ? MAX_EMAIL : MAX_IP; return t.length >= lim ? t[t.length - lim] + TRY_WINDOW : 0; }));
const tooManyMsg = (keys) => ({ error: "Too many tries.", retryAt: retryAt(keys) });
const resetOK = (x) => x && x.reset && (x.reset_at || 0) + RESET_MINUTES * 60e3 > Date.now();
async function setNewPassword(req, res, x, how) {
  q("UPDATE users SET pass=?, reset=NULL, reset_at=NULL WHERE id=?").run(await hashPw(req._pw), x.id);
  signOutAll(x.id); pk.removeAll(x.id); audit(x.id, how); // a recovered account starts clean: no old sessions or passkeys
  return send(res, 200, { ok: true }, signIn(req, x.id, "link"));
}
// Login rate limit: counted per address AND per email, before the password is checked, so neither
// rotating a spoofed header nor firing many attempts at once gets around it.
const tries = new Map(), TRY_WINDOW = 15 * 60e3, MAX_IP = 10, MAX_EMAIL = 10;
function recent(key) { const now = Date.now(); const t = (tries.get(key) || []).filter((x) => now - x < TRY_WINDOW); if (t.length) tries.set(key, t); else tries.delete(key); return t; }
function tooMany(...keys) { return keys.some((k) => recent(k).length >= (k.startsWith("e:") ? MAX_EMAIL : MAX_IP)); }
function addTry(...keys) { for (const k of keys) { const t = recent(k); t.push(Date.now()); tries.set(k, t); } }
setInterval(() => { for (const k of [...tries.keys()]) recent(k); }, 5 * 60e3).unref();
// The visitor's address. X-Forwarded-For is only believed when the request itself came from a private
// network (the hosting proxy), and then only the entry that proxy added (the last one): anything
// earlier in the header was written by the visitor and can be faked.
const PRIVATE_IP = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|::ffff:(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i;
function clientIp(req) {
  const peer = req.socket.remoteAddress || "";
  const xff = req.headers["x-forwarded-for"];
  if (!xff || !PRIVATE_IP.test(peer)) return peer;
  const hops = String(xff).split(",").map((x) => x.trim()).filter(Boolean);
  return hops[hops.length - 1] || peer;
}
// Checked when the email has no account (or no password yet), so a wrong email takes as long as a wrong password.
let DUMMY_PW = null;
const wagesOK = (u) => u.role === "CEO" || !!u.areas?.includes("wages") || (u.role === "Manager" && ((readSec("WG") || {}).access || []).includes(u.pkey));
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, pkey: u.pkey, role: u.role, job: u.job, areas: u.areas });

/* ---------------- Live updates (server-sent events) ---------------- */
const clients = new Set();
// People outside the team (e.g. investors) only ever hear that their chat with the CEO changed: no staff pings,
// no task or announcement updates, and never who made a change.
const isOutsider = (u) => u && u.role !== "CEO" && !u.areas?.includes("msg") && !u.areas?.includes("people");
function outsiderEvt(evt, u) {
  if (evt.type !== "changed") return null;
  const secs = (evt.sections || []).filter((k) => k === "CONVS" ? evt.by === ceoPkey() || evt.by === u.pkey : k === "VCAL" ? u.areas.includes("mycal") : mayRead(k, u));
  return secs.length ? { type: "changed", sections: secs, by: "sys" } : null;
}
function broadcast(evt, filter = () => true) { for (const c of clients) if (filter(c.user)) { const e = isOutsider(c.user) ? outsiderEvt(evt, c.user) : evt; if (!e) continue; try { c.res.write(`data: ${JSON.stringify(e)}\n\n`); } catch {} } }
setInterval(() => { for (const c of clients) try { c.res.write(": ping\n\n"); } catch {} }, 25e3);

const cx = makeConnections({ db, q, readSec, writeSec, getSetting, setSetting, audit, broadcast, DATA });
const pk = makePasskeys({ db, q });
// Passkeys belong to the address people use (PUBLIC_URL when set).
const rpOf = (url) => { const origin = publicOrigin(url); return { origin, rpId: new URL(origin).hostname }; };

/* ---------------- HTTP helpers ---------------- */
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(obj)); };
function body(req, limit) {
  return new Promise((ok, bad) => { const chunks = []; let n = 0;
    req.on("data", (c) => { if (n > limit) return; n += c.length; if (n > limit) { chunks.length = 0; bad(Object.assign(new Error("too large"), { code: 413 })); } else chunks.push(c); });
    req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", bad); });
}
const json = async (req, limit = 256 * 1024) => { const b = await body(req, limit); try { return JSON.parse(b.toString() || "{}"); } catch { throw Object.assign(new Error("bad json"), { code: 400 }); } };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "SAMEORIGIN" };
const validEmail = (e) => typeof e === "string" && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const strongPw = (p) => typeof p === "string" && p.length >= 10 && p.length <= 200;
function nextKey(name) { const base = (String(name).match(/\b\w/g) || ["N", "N"]).join("").toUpperCase().slice(0, 2).padEnd(2, "X"); let k = base, i = 2; while (q("SELECT 1 FROM users WHERE pkey=?").get(k)) k = base[0] + i++; return k; }

/* ---------------- Routes ---------------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method, ip = clientIp(req);
  // Every change must come from our own page (blocks cross-site form posts).
  if (m !== "GET" && req.headers["x-helm"] !== "1") return send(res, 403, { error: "Missing request header" });

  if (p === "/api/status" && m === "GET") return send(res, 200, { setup: setupOpen(), ownerRecovery: !!process.env.SETUP_CODE, pin: true });

  if (p === "/api/setup" && m === "POST") {
    if (!setupOpen()) return send(res, 409, { error: "Already set up" });
    const b = await json(req);
    if (tooMany("i:" + ip)) return send(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    const code = Buffer.from(String(b.code || "").trim()), want = Buffer.from(SETUP_CODE);
    if (code.length !== want.length || !timingSafeEqual(code, want)) { addTry("i:" + ip); return send(res, 403, { error: "That setup code is wrong. It’s in the server log, or it’s the SETUP_CODE you set." }); }
    if (!validEmail(b.email) || !b.name) return send(res, 400, { error: "Enter your name and a valid email." });
    if (!validPin(b.pin)) return send(res, 400, { error: PIN_RULE });
    const r = q("INSERT INTO users(email,name,pkey,role,pin,created) VALUES(?,?,?,?,?,?)").run(b.email.toLowerCase(), String(b.name).slice(0, 80), "AK", "CEO", await hashPw(b.pin), Date.now());
    setSetting("setup_done", "1");
    const P = readSec("P") || {}; P.AK = [String(b.name).slice(0, 80), (P.AK || [])[1] || "#1c1d21", (P.AK || [])[2] || "#fff"]; writeSec("P", P, r.lastInsertRowid);
    audit(r.lastInsertRowid, "set up the workspace");
    return send(res, 200, { ok: true }, signIn(req, r.lastInsertRowid, "setup"));
  }

  if (p === "/api/login" && m === "POST") {
    const b = await json(req); const email = String(b.email || "").toLowerCase().slice(0, 200);
    // On a remembered device the limit is for that device alone, so nobody else can lock you out by guessing.
    const dev = deviceOf(req), mine = dev && q("SELECT 1 FROM users WHERE id=? AND email=?").get(dev.user_id, email);
    const keys = mine ? ["d:" + dev.token] : ["i:" + ip, "e:" + email];
    if (tooMany(...keys)) return send(res, 429, tooManyMsg(keys));
    addTry(...keys); // counted up front; a successful sign-in clears it
    const u = q("SELECT * FROM users WHERE email=?").get(email);
    // Same message, same work and same timing whether or not the email has an account.
    const ok = await checkPw(String(b.password || ""), u && !u.pin && u.role === "CEO" ? u.pass : null);
    // Helm uses PINs now. A password only still works for an owner who hasn't set a PIN yet, and they're asked to set one straight away.
    if (!u || !ok) return send(res, 401, { error: "Helm uses PINs now. Open the sign-in link from your workspace owner." });
    keys.forEach((k) => tries.delete(k));
    return send(res, 200, { ok: true }, signIn(req, u.id, "password"));
  }

  // Signing in with a PIN, on a device set up with the owner's link.
  if (p === "/api/pin/who" && m === "GET") {
    const dev = deviceOf(req), x = dev && q("SELECT name, email, blocked FROM users WHERE id=?").get(dev.user_id);
    return send(res, 200, x ? { name: String(x.name).split(" ")[0], email: x.email, owner: ownerFirst() } : { owner: ownerFirst() });
  }
  if (p === "/api/pin" && m === "POST") {
    const dev = deviceOf(req); if (!dev) return send(res, 403, { error: `This device isn’t set up for Helm yet. Open the sign-in link ${ownerFirst()} sent you.`, noDevice: true });
    const k = "d:" + dev.token; if (tooMany(k)) return send(res, 429, tooManyMsg([k])); addTry(k);
    const x = q("SELECT * FROM users WHERE id=?").get(dev.user_id); if (!x) return send(res, 403, { error: "This account was removed.", noDevice: true });
    const b = await json(req), bad = await pinCheck(x, b.pin); if (bad) return send(res, bad.status, { error: bad.error });
    tries.delete(k); return send(res, 200, { ok: true }, signIn(req, x.id, "pin"));
  }
  // The owner's link: shows who it's for, then the PIN sets up this device and signs in. It works once, for a week.
  if (p === "/api/join/info" && m === "GET") { const x = linkUser(url.searchParams.get("t")); return x && !x.blocked ? send(res, 200, { name: String(x.name).split(" ")[0], email: x.email, owner: ownerFirst(), first: !!x.invite }) : send(res, 404, { error: "Link not found" }); }
  if (p === "/api/join" && m === "POST") {
    // Only failures count here, so a whole office joining from one network at once is never held up.
    const kJ = "j:" + ip; if (tooMany(kJ)) return send(res, 429, tooManyMsg([kJ]));
    const b = await json(req), x = linkUser(b.token);
    if (!x) { addTry(kJ); return send(res, 404, { error: `This link has expired or was already used. Ask ${ownerFirst()} for a new one.` }); }
    const bad = await pinCheck(x, b.pin); if (bad) { addTry(kJ); return send(res, bad.status, { error: bad.error }); }
    q("UPDATE users SET link=NULL, link_at=NULL, invite=NULL WHERE id=?").run(x.id); audit(x.id, x.invite ? "joined" : "set up a new device");
    return send(res, 200, { ok: true }, signIn(req, x.id, "join"));
  }
  // There's no help queue: the owner gives people their PIN and links. Kept so older pages get a plain answer.
  if (p === "/api/recover/ask" && m === "POST") return send(res, 200, { ok: true, owner: ownerFirst() });
  if (p === "/api/recover/ask-old" && m === "POST") {
    const b = await json(req), kH = "h:" + ip; // its own limit, so a sign-in lock never stops someone asking for help if (tooMany(kH)) return send(res, 429, tooManyMsg([kH])); addTry(kH);
    const x = q("SELECT id FROM users WHERE email=? AND invite IS NULL").get(String(b.email || "").toLowerCase().slice(0, 200));
    if (x) { q("INSERT INTO help(user_id,at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET at=excluded.at").run(x.id, Date.now()); audit(x.id, "asked for a sign-in link"); broadcast({ type: "help" }, (v) => v.role === "CEO" || v.role === "Manager"); }
    return send(res, 200, { ok: true });
  }
  // A sign-in link someone was given: it works once, for an hour, and signs out every other device.
  if (p === "/api/reset/info" && m === "GET") { const x = q("SELECT name,email,reset,reset_at FROM users WHERE reset=?").get(sha(url.searchParams.get("t") || "")); return resetOK(x) ? send(res, 200, { name: x.name, email: x.email }) : send(res, 404, { error: "Link not found" }); }
  if (p === "/api/reset" && m === "POST") return send(res, 410, { error: `Helm uses PINs now. Ask ${ownerFirst()} for a new PIN.` });
  if (p === "/api/reset-old" && m === "POST") {
    const b = await json(req); const x = b.token && q("SELECT * FROM users WHERE reset=?").get(sha(b.token));
    if (!resetOK(x)) return send(res, 404, { error: "This link has expired or was already used. Ask for a new one." });
    if (!strongPw(b.password)) return send(res, 400, { error: "Use a password of at least 10 characters." });
    req._pw = b.password; return setNewPassword(req, res, x, "set a new password with a sign-in link");
  }
  // The CEO can't ask themselves for a link, so they use the SETUP_CODE they chose (only when it's set as a variable).
  if (p === "/api/reset/owner" && m === "POST") {
    const kO = "o:" + ip; if (!process.env.SETUP_CODE) return send(res, 404, { error: "Not available" });
    if (tooMany(kO)) return send(res, 429, tooManyMsg([kO])); addTry(kO);
    const b = await json(req); const x = q("SELECT * FROM users WHERE email=? AND role='CEO'").get(String(b.email || "").toLowerCase().slice(0, 200));
    const code = Buffer.from(String(b.code || "").trim()), want = Buffer.from(SETUP_CODE);
    if (!x || code.length !== want.length || !timingSafeEqual(code, want)) return send(res, 403, { error: "That email or setup code is wrong." });
    if (!validPin(b.pin)) return send(res, 400, { error: PIN_RULE });
    tries.delete(kO); q("UPDATE users SET pin=?, pass=NULL, pin_fails=0, locked=0, blocked=0 WHERE id=?").run(await hashPw(b.pin), x.id);
    signOutAll(x.id); pk.removeAll(x.id); audit(x.id, "set a new PIN with the setup code");
    return send(res, 200, { ok: true }, signIn(req, x.id, "link"));
  }

  if (p === "/api/invite/accept" && m === "POST") return send(res, 410, { error: "Open your link again and enter your PIN." });
  if (p === "/api/invite/accept-old" && m === "POST") {
    const b = await json(req); const u = b.token && q("SELECT * FROM users WHERE invite=?").get(String(b.token));
    if (!inviteOK(u)) return send(res, 404, { error: "This invite link has expired or was already used." });
    if (!strongPw(b.password)) return send(res, 400, { error: "Use a password of at least 10 characters." });
    q("UPDATE users SET pass=?, invite=NULL, name=COALESCE(?,name) WHERE id=?").run(await hashPw(b.password), b.name ? String(b.name).slice(0, 80) : null, u.id);
    audit(u.id, "accepted invite");
    return send(res, 200, { ok: true }, signIn(req, u.id, "invite"));
  }
  if (p === "/api/invite/info" && m === "GET") { const u = q("SELECT name,email,invite,created FROM users WHERE invite=?").get(url.searchParams.get("t") || ""); return inviteOK(u) ? send(res, 200, { name: u.name, email: u.email }) : send(res, 404, { error: "Invite not found" }); }

  // Continue with Google: only people who already have an account (or an invite for that email) get in.
  if (p === "/api/auth/google" && m === "GET") { res.writeHead(302, { location: "/login" }); res.end(); return; }
  if (p === "/api/auth/google-old" && m === "GET") {
    const t = url.searchParams.get("t"), go = cx.googleSignInStart(url, t ? { invite: String(t) } : {});
    res.writeHead(302, { location: go || "/login?e=" + encodeURIComponent("Google sign-in isn’t set up yet.") }); res.end(); return;
  }
  if (p === "/api/connect/callback/google" && m === "GET") {
    const r = await cx.googleSignInFinish(url);
    if (r) {
      const back = (e) => { res.writeHead(302, { location: (r.st.invite ? "/join?t=" + encodeURIComponent(r.st.invite) + "&" : "/login?") + "e=" + encodeURIComponent(e) }); res.end(); };
      if (r.error) return back(r.error);
      let x;
      if (r.st.invite) {
        x = q("SELECT * FROM users WHERE invite=?").get(r.st.invite);
        if (!inviteOK(x)) return back("This invite link has expired or was already used. Ask for a new one.");
        if (x.email !== r.email) return back(`That Google account is ${r.email}, but this invite is for ${x.email}.`);
        q("UPDATE users SET invite=NULL WHERE id=?").run(x.id); audit(x.id, "accepted invite with Google");
      } else {
        x = q("SELECT * FROM users WHERE email=? AND invite IS NULL").get(r.email);
        if (!x) return back(`No Helm account uses ${r.email}. Ask your CEO for an invite.`);
      }
      res.writeHead(302, { location: "/", ...signIn(req, x.id, r.st.invite ? "invite" : "google") }); res.end(); return;
    }
  }
  // Sign in with a passkey.
  if ((p === "/api/passkey/options" || p === "/api/passkey/signin") && m === "POST") return send(res, 410, { error: "Helm uses PINs now." });
  if (p === "/api/passkey/options-old" && m === "POST") { const k = "p:" + ip; if (tooMany(k)) return send(res, 429, tooManyMsg([k])); addTry(k); return send(res, 200, pk.signInOptions(rpOf(url).rpId)); }
  if (p === "/api/passkey/signin-old" && m === "POST") {
    const b = await json(req), { rpId, origin } = rpOf(url);
    let uid; try { uid = pk.use(b, rpId, origin); } catch (e) { return send(res, 401, { error: e.message }); }
    if (!q("SELECT 1 FROM users WHERE id=?").get(uid)) return send(res, 401, { error: "This passkey’s account was removed." });
    tries.delete("p:" + ip); return send(res, 200, { ok: true }, signIn(req, uid, "passkey"));
  }

  const u = userFrom(req);
  if (!u) return send(res, 401, { error: "Sign in" });

  // Your passkeys: list, add, remove.
  if (p === "/api/passkeys" && m === "GET") return send(res, 200, pk.list(u.id));
  if (p === "/api/passkeys/options" && m === "POST") return send(res, 200, pk.addOptions(u, rpOf(url).rpId));
  if (p === "/api/passkeys" && m === "POST") {
    const b = await json(req), { rpId, origin } = rpOf(url);
    try { pk.add(u, b, rpId, origin, deviceName(req)); } catch (e) { return send(res, 400, { error: e.message }); }
    audit(u.id, "added a passkey"); return send(res, 200, pk.list(u.id));
  }
  const pm = /^\/api\/passkeys\/([A-Za-z0-9_-]{8,400})$/.exec(p);
  if (pm && m === "DELETE") { if (!pk.remove(u.id, pm[1])) return send(res, 404, { error: "Not found" }); audit(u.id, "removed a passkey"); return send(res, 200, pk.list(u.id)); }

  if (p === "/api/logout" && m === "POST") { q("DELETE FROM sessions WHERE user_id=? AND token=?").run(u.id, createHash("sha256").update((/(?:^|;\s*)helm_s=([a-f0-9]{64})/.exec(req.headers.cookie) || [])[1] || "").digest("hex")); return send(res, 200, { ok: true }, { "set-cookie": cookie(req, "", 0) }); }
  if (p === "/api/me" && m === "GET") {
    // Sign-ins from new devices since this device signed in, so the person can stop one that wasn't them.
    const since = Math.max(u.expires - SESSION_MS, Date.now() - 7 * 864e5);
    const signins = q("SELECT id, at, what FROM signins WHERE user_id=? AND at>? ORDER BY at DESC LIMIT 5").all(u.id, since);
    return send(res, 200, { ...pub(u), wages: wagesOK(u), seeded: !!q("SELECT 1 FROM sections WHERE name='TASKS'").get(), signins, needPin: !u.pin });
  }
  // Who can send a sign-in link to whom: the CEO to anyone else, a Manager to Members and Guests.
  const canRecover = () => false; // only the owner gives access now (see /api/users/:id/pin and /link)
  // Your own PIN. The owner changes theirs here; everyone else's PIN is set by the owner.
  if (p === "/api/me/pin" && m === "POST") {
    if (u.role !== "CEO") return send(res, 403, { error: `Your PIN is set by ${ownerFirst()}. Ask them for a new one.` });
    const k = "c:" + u.id; if (tooMany(k)) return send(res, 429, tooManyMsg([k])); addTry(k);
    const b = await json(req), me = q("SELECT pin FROM users WHERE id=?").get(u.id);
    if (me.pin && !(await checkPw(String(b.current || ""), me.pin))) return send(res, 401, { error: "Your current PIN is wrong." });
    if (!validPin(b.pin)) return send(res, 400, { error: PIN_RULE });
    q("UPDATE users SET pin=?, pass=NULL, pin_fails=0, locked=0 WHERE id=?").run(await hashPw(b.pin), u.id); tries.delete(k); audit(u.id, "changed their PIN"); return send(res, 200, { ok: true });
  }
  // Owner-only: a new PIN (after a security worry or a pause), a link for another device, or turning access off and on.
  let am = /^\/api\/users\/(\d+)\/(pin|link|access)$/.exec(p);
  if (am && m === "POST") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the workspace owner can change access." });
    const x = q("SELECT * FROM users WHERE id=?").get(+am[1]); if (!x) return send(res, 404, { error: "No such person" });
    const b = await json(req);
    if (am[2] === "pin") {
      if (x.id === u.id) return send(res, 400, { error: "Change your own PIN in Settings." });
      const pin = b.pin ? String(b.pin) : newPin(); if (!validPin(pin)) return send(res, 400, { error: PIN_RULE });
      q("UPDATE users SET pin=?, pass=NULL, pin_fails=0, locked=0, blocked=0 WHERE id=?").run(await hashPw(pin), x.id);
      signOutAll(x.id); pk.removeAll(x.id); // a new PIN after a worry: every device and session is cleared
      const link = newLink(x.id, url); audit(u.id, "gave " + x.email + " a new PIN"); return send(res, 200, { pin, link, days: LINK_DAYS });
    }
    if (am[2] === "link") { if (x.blocked) return send(res, 400, { error: "Turn their access back on first." }); const link = newLink(x.id, url); audit(u.id, "made a device link for " + x.email); return send(res, 200, { link, days: LINK_DAYS }); }
    if (x.id === u.id || x.role === "CEO") return send(res, 400, { error: "You can’t turn off the owner’s access." });
    if (b.on) { q("UPDATE users SET blocked=0 WHERE id=?").run(x.id); const link = newLink(x.id, url); audit(u.id, "turned on access for " + x.email); return send(res, 200, { link, days: LINK_DAYS }); }
    q("UPDATE users SET blocked=1, link=NULL, link_at=NULL WHERE id=?").run(x.id); signOutAll(x.id); pk.removeAll(x.id); audit(u.id, "turned off access for " + x.email); return send(res, 200, { ok: true });
  }
  // Plans and seats. Every account with access counts (the owner, people who've joined and invites waiting), so removing
  // someone or turning their access off frees a seat at once. Going over is never blocked: Helm suggests the next plan.
  if (p === "/api/plan" && m === "GET") { if (u.role !== "CEO") return send(res, 403, { error: "Owner only" }); return send(res, 200, planInfo()); }
  if (p === "/api/plan" && m === "POST") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the workspace owner changes the plan." });
    const b = await json(req), t = PLANS.find((x) => x.seats === +b.seats); if (!t) return send(res, 400, { error: "Pick one of the plans." });
    setSetting("plan", String(t.seats)); audit(u.id, `moved to the Up to ${t.seats} plan`); return send(res, 200, planInfo());
  }
  // More than 30 people: a request for a special quote, kept for the Helm team to answer.
  if (p === "/api/quote" && m === "POST") {
    if (u.role !== "CEO") return send(res, 403, { error: "Owner only" });
    const b = await json(req), seats = Math.max(31, Math.min(100000, Math.round(+b.seats || 0))), email = validEmail(b.email) ? b.email : u.email;
    q("INSERT INTO quotes(at,user_id,seats,email,note) VALUES(?,?,?,?,?)").run(Date.now(), u.id, seats, email, noTags(b.note, 2000)); audit(u.id, `asked for a quote for ${seats} people`);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/recover/asks" && m === "GET") return send(res, 200, []);
  if (p === "/api/recover/asks-old" && m === "GET") {
    if (u.role !== "CEO" && u.role !== "Manager") return send(res, 200, []);
    return send(res, 200, q("SELECT u.id, u.name, u.email, u.role, u.invite, h.at FROM help h JOIN users u ON u.id=h.user_id ORDER BY h.at DESC").all().filter(canRecover).map(({ invite, ...x }) => x));
  }
  if (p === "/api/state" && m === "GET") return send(res, 200, stateFor(u));
  // A person's own private notes and calendar. Read and written by that account only.
  if (p === "/api/mine/notes" || p === "/api/mine/cal") {
    const kind = p.endsWith("notes") ? "notes" : "cal", area = kind === "notes" ? "mynotes" : "mycal";
    if (u.role === "CEO" || !u.areas.includes(area)) return send(res, 403, { error: "Not available for your role." });
    if (m === "GET") return send(res, 200, kind === "notes" ? { notes: readMine(u.id, "notes") } : { own: readMine(u.id, "cal"), shared: readSec("VSHARE") || [] });
    if (m === "PUT") {
      const b = await json(req, 4 * MB), list = Array.isArray(kind === "notes" ? b.notes : b.own) ? (kind === "notes" ? b.notes : b.own) : [];
      const seen = new Set(), clean = list.slice(0, kind === "notes" ? 500 : 2000).map(kind === "notes" ? cleanMyNote : cleanMyEv).filter((x) => x && !seen.has(x.id) && seen.add(x.id));
      writeMine(u.id, kind, clean); return send(res, 200, { ok: true });
    }
  }

  if (p === "/api/state" && m === "PUT") {
    const b = await json(req, MAX_JSON); const secs = swapKeys(b.sections || {}, "AK", u.pkey); const done = [], refused = [], conflicts = [], big = [];
    // Each section has a version (when it was last saved). If someone else saved it after this browser loaded it,
    // the save is held back and the person is asked which version to keep, instead of silently overwriting.
    const base = b.base && typeof b.base === "object" ? b.base : {}, force = new Set(Array.isArray(b.force) ? b.force : []);
    const stale = (k) => { if (k === "CONVS" || force.has(k) || base[k] == null) return null; const r = q("SELECT updated, by FROM sections WHERE name=?").get(k); return r && r.updated > base[k] && r.by !== u.id ? r : null; };
    for (let [k, v] of Object.entries(secs)) {
      const st = mayWrite(k, u) || k === "SPX" ? stale(k) : null;
      if (st) { const w = st.by && q("SELECT name FROM users WHERE id=?").get(st.by); conflicts.push({ sec: k, by: w ? String(w.name).split(" ")[0] : "Someone", at: st.updated }); continue; }
      const put = (val) => { if (tooBig(k, val)) big.push(k); else { writeSec(k, val, u.id); done.push(k); } };
      if (k === "CONVS") { if (!readSec("CONVS") && u.role === "CEO") put(cleanSeedConvs(v)); else if (mergeConvs(v, u)) done.push(k); else big.push(k); continue; }
      if (k === "TASKS") { if (!mayWrite(k, u)) { refused.push(k); continue; } put(mergeTasks(v, u)); continue; }
      if (k === "CEV") { if (!mayWrite(k, u)) { refused.push(k); continue; } put(mergeCev(v, u)); syncShared(); continue; }
      if (k === "SPX") { put(mergeSpx(v, u)); continue; }
      if (k === "WG") { if (u.role === "CEO" && !readSec("WG") && v) { writeSec("WG", { access: v.access, rows: v.rows }, u.id); done.push(k); } else refused.push(k); continue; }
      if (k === "MEM" && u.role === "CEO") { // role changes go to accounts too
        for (const [pk, role] of v || []) if (pk !== u.pkey && role !== "CEO" && jobNames().includes(role)) q("UPDATE users SET role=? WHERE pkey=? AND role<>'CEO'").run(role, pk);
      }
      if (!mayWrite(k, u)) { refused.push(k); continue; }
      put(cleanSection(k, v));
    }
    if (done.length) { audit(u.id, "updated " + done.join(", ")); broadcast({ type: "changed", sections: done, by: u.pkey }, (x) => x.id !== u.id); }
    const ver = {}; for (const k of done) { const r = q("SELECT updated FROM sections WHERE name=?").get(k); if (r) ver[k] = r.updated; }
    return send(res, refused.length && !done.length && !conflicts.length && !big.length ? 403 : 200, { saved: done, refused, conflicts, tooBig: big, ver });
  }

  // Wages are role-based: the CEO, plus the people the CEO gives access to. No PIN.
  if (p === "/api/wages" && m === "GET") {
    if (!wagesOK(u)) return send(res, 403, { error: "You don’t have access to wages." });
    audit(u.id, "opened wages");
    return send(res, 200, swapKeys(readSec("WG") || { access: [u.pkey], rows: [] }, "AK", u.pkey));
  }
  if (p === "/api/wages" && m === "PUT") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the CEO can change wages." });
    const v = swapKeys(await json(req, SEC_MAX_OTHER), "AK", u.pkey);
    const access = Array.from(new Set([u.pkey, ...(Array.isArray(v.access) ? v.access.map(String) : [])]));
    writeSec("WG", { access, rows: Array.isArray(v.rows) ? v.rows : [] }, u.id); audit(u.id, "updated wages");
    broadcast({ type: "wages" });
    return send(res, 200, { ok: true });
  }

  if (p === "/api/users" && m === "GET") { if (u.role !== "CEO") return send(res, 403, { error: "CEO only" }); return send(res, 200, q("SELECT id,email,name,pkey,role, invite IS NOT NULL AS pending, locked, blocked, pin IS NOT NULL AS hasPin, (SELECT COUNT(*) FROM devices d WHERE d.user_id=users.id) AS devices FROM users").all().map((x) => swapKeys(x, "AK", u.pkey))); }
  // Sign someone out on every device: the CEO for anyone, or anyone for themselves.
  let um = /^\/api\/users\/(\d+)\/signout$/.exec(p);
  if (um && m === "POST") {
    const id = +um[1]; if (u.role !== "CEO" && id !== u.id) return send(res, 403, { error: "Only the CEO can sign other people out." });
    const x = q("SELECT id,name FROM users WHERE id=?").get(id); if (!x) return send(res, 404, { error: "No such person" });
    signOutAll(id); audit(u.id, id === u.id ? "signed out everywhere" : "signed out " + x.name); return send(res, 200, { ok: true });
  }
  um = /^\/api\/users\/(\d+)\/recover$/.exec(p);
  if (um && m === "POST") {
    const x = q("SELECT * FROM users WHERE id=?").get(+um[1]);
    if (!canRecover(x)) return send(res, 403, { error: u.role === "Manager" ? "Managers can send links to Members and Guests. Ask the CEO." : "You can’t send a link to this person." });
    const t = randomBytes(24).toString("hex"); q("UPDATE users SET reset=?, reset_at=? WHERE id=?").run(sha(t), Date.now(), x.id);
    q("DELETE FROM help WHERE user_id=?").run(x.id); audit(u.id, "made a sign-in link for " + x.email);
    return send(res, 200, { link: `${publicOrigin(url)}/reset?t=${t}`, minutes: RESET_MINUTES });
  }
  // Remove someone's account: they're signed out at once and can't sign in again. Their name stays on
  // their past work and tasks, so nothing goes missing; reassign their open tasks after.
  um = /^\/api\/users\/(\d+)$/.exec(p);
  if (um && m === "DELETE") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the CEO can remove people." });
    const x = q("SELECT * FROM users WHERE id=?").get(+um[1]); if (!x) return send(res, 404, { error: "No such person" });
    if (x.role === "CEO" || x.id === u.id) return send(res, 400, { error: "The CEO’s account can’t be removed." });
    signOutAll(x.id); pk.removeAll(x.id); q("DELETE FROM users WHERE id=?").run(x.id);
    writeSec("MEM", (readSec("MEM") || []).filter((mm) => mm[0] !== x.pkey), u.id);
    const W = readSec("WG"); if (W && Array.isArray(W.access)) { W.access = W.access.filter((k) => k !== x.pkey); writeSec("WG", W, u.id); }
    audit(u.id, "removed " + x.email); broadcast({ type: "changed", sections: ["MEM"], by: u.pkey }); return send(res, 200, { ok: true });
  }
  if (p === "/api/invite" && m === "POST") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the workspace owner can invite people." });
    const b = await json(req); if (!validEmail(b.email)) return send(res, 400, { error: "Enter a valid email." });
    const role = b.role !== "CEO" && jobNames().includes(b.role) ? b.role : "Member";
    const had = q("SELECT * FROM users WHERE email=?").get(b.email.toLowerCase());
    if (had && !had.invite) return send(res, 409, { error: "That person already has an account." });
    const pin = b.pin ? String(b.pin) : newPin(); if (!validPin(pin)) return send(res, 400, { error: PIN_RULE });
    if (had) { q("UPDATE users SET pin=?, pin_fails=0, locked=0, created=? WHERE id=?").run(await hashPw(pin), Date.now(), had.id); audit(u.id, "sent a new invite to " + had.email); return send(res, 200, { link: newLink(had.id, url), pin, days: LINK_DAYS, pkey: swapKeys(had.pkey, "AK", u.pkey) }); }
    let pkey = b.pkey ? swapKeys(String(b.pkey), "AK", u.pkey) : null;
    if (pkey && q("SELECT 1 FROM users WHERE pkey=?").get(pkey)) return send(res, 409, { error: "That team member already has an account." });
    const P = readSec("P") || {};
    if (!pkey) { pkey = nextKey(b.name || b.email); P[pkey] = [String(b.name || b.email.split("@")[0]).slice(0, 80), "#efeff1", "#3f4148"]; writeSec("P", P, u.id); }
    { const mem = readSec("MEM") || []; if (!mem.some((x) => x[0] === pkey)) { mem.push([pkey, role]); writeSec("MEM", mem, u.id); } }
    const r = q("INSERT INTO users(email,name,pkey,role,invite,pin,created) VALUES(?,?,?,?,?,?,?)").run(b.email.toLowerCase(), String((P[pkey] || [b.name || b.email.split("@")[0]])[0]).slice(0, 80), pkey, role, "pending", await hashPw(pin), Date.now());
    audit(u.id, "invited " + b.email + " as " + role);
    return send(res, 200, { link: newLink(r.lastInsertRowid, url), pin, days: LINK_DAYS, pkey: swapKeys(pkey, "AK", u.pkey) });
  }

  if (p === "/api/files" && m === "POST") {
    const area = url.searchParams.get("area") || "space"; if (!canFile(area, u, true)) return send(res, 403, { error: "Not allowed" });
    let space = null;
    // A file sent in a direct message: only the two people in that conversation can open it.
    if (area === "dm") { const other = swapKeys(String(url.searchParams.get("space") || ""), "AK", u.pkey); const pair = [u.pkey, other].sort();
      if (!isId(other) || other === u.pkey || !q("SELECT 1 FROM users WHERE pkey=?").get(other) || !chatAllowed({ parts: pair }, u)) return send(res, 403, { error: "You can’t send files to this person." });
      space = "dm:" + pair.join("|"); }
    if (area === "space") { space = url.searchParams.get("space"); const conv = (readSec("CONVS") || []).find((c) => c.ch && c.id === space); if (!conv || !canSeeConv(conv, u)) return send(res, 403, { error: "You’re not in that space." }); }
    let name = "file"; try { name = decodeURIComponent(String(req.headers["x-file-name"] || "file")); } catch {}
    name = name.replace(/[\\/\0<>\u0000-\u001f]/g, "_").trim().slice(0, 200) || "file";
    const used = () => [q("SELECT COALESCE(SUM(size),0) n FROM files").get().n, q("SELECT COALESCE(SUM(size),0) n FROM files WHERE owner=?").get(u.id).n];
    const full = (n) => { const [all, mine] = used(); return all + n > FILES_TOTAL ? "The workspace’s file storage is full." : mine + n > FILES_EACH ? "You’ve used all of your file storage." : null; };
    const said = +req.headers["content-length"] || 0; let why = said && full(said); if (why) { req.resume(); return send(res, 413, { error: why }); }
    const buf = await body(req, MAX_FILE); why = full(buf.length); if (why) return send(res, 413, { error: why });
    const id = randomBytes(16).toString("hex");
    await writeFile(join(FILES, id), buf);
    q("INSERT INTO files(id,name,mime,size,owner,area,created,space) VALUES(?,?,?,?,?,?,?,?)").run(id, name, String(req.headers["content-type"] || "application/octet-stream").slice(0, 100), buf.length, u.id, area, Date.now(), space);
    audit(u.id, "uploaded " + name);
    return send(res, 200, { id, url: "/api/files/" + id, size: buf.length });
  }
  const fm = /^\/api\/files\/([a-f0-9]{32})$/.exec(p);
  if (fm && m === "GET") {
    const f = q("SELECT * FROM files WHERE id=?").get(fm[1]); if (!f || !canFile(f.area, u, false)) return send(res, 404, { error: "Not found" });
    if (f.area === "dm" && !String(f.space || "").slice(3).split("|").includes(u.pkey)) return send(res, 404, { error: "Not found" });
    if (f.area === "space" && u.role !== "CEO") { // only members of the space (or whoever uploaded it) can open a space file
      const conv = f.space && (readSec("CONVS") || []).find((c) => c.ch && c.id === f.space);
      if (!(conv ? canSeeConv(conv, u) : f.owner === u.id || u.role === "Manager")) return send(res, 404, { error: "Not found" });
    }
    const buf = await readFile(join(FILES, f.id)).catch(() => null); if (!buf) return send(res, 404, { error: "Missing" });
    const safe = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm)|application\/pdf|text\/plain)$/.test(f.mime);
    res.writeHead(200, { "content-type": safe ? f.mime : "application/octet-stream", "content-length": buf.length, "content-disposition": `${safe ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`, "cache-control": "private, max-age=3600", "content-security-policy": "sandbox", ...SEC_HEADERS });
    return res.end(buf);
  }
  if (fm && m === "DELETE") { const f = q("SELECT * FROM files WHERE id=?").get(fm[1]); if (!f || (f.owner !== u.id && u.role !== "CEO")) return send(res, 404, { error: "Not found" }); q("DELETE FROM files WHERE id=?").run(f.id); await unlink(join(FILES, f.id)).catch(() => {}); return send(res, 200, { ok: true }); }

  if (p === "/api/events" && m === "GET") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" }); res.write(": hi\n\n");
    const c = { res, user: u }; clients.add(c); req.on("close", () => clients.delete(c)); return;
  }
  if (await cx.route(req, res, url, u, json)) return;
  return send(res, 404, { error: "Not found" });
}

/* ---------------- Due dates ---------------- */
// Older tasks store due dates as short labels ("Oct 20", "Fri", "Today"). This mirrors the app's reading of them,
// so cleanTask can give each one a full date.
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dueISO(d, now = new Date()) {
  if (!d) return null; const pad = (n) => String(n).padStart(2, "0"); const iso = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  if (d === "Today") return iso(now);
  if (d === "Tomorrow") { const x = new Date(now); x.setDate(x.getDate() + 1); return iso(x); }
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d); if (wd >= 0) { const x = new Date(now); x.setDate(x.getDate() + ((wd - x.getDay() + 7) % 7)); return iso(x); }
  let m = /^([A-Z][a-z]{2}) (\d+)$/.exec(d) || /^(\d+) ([A-Z][a-z]{2})$/.exec(d); if (!m) return null;
  const [mon, day] = isNaN(m[1]) ? [m[1], +m[2]] : [m[2], +m[1]]; const mi = MON3.indexOf(mon); if (mi < 0) return null;
  let y = now.getFullYear(); if (mi < now.getMonth() - 6) y++; else if (mi > now.getMonth() + 5) y--; return `${y}-${pad(mi + 1)}-${pad(day)}`;
}
setInterval(() => { try { tidySpaces(); } catch {} }, 60 * 60e3).unref();
setTimeout(() => { try { tidySpaces(); } catch {} }, 15e3).unref();

const csp = (n) => `default-src 'self'; script-src 'nonce-${n}' https://cdn.plaid.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'self' blob:; frame-src https://cdn.plaid.com; connect-src 'self' https://*.plaid.com; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`;
const page = async (res, f) => { let html = await readFile(join(ROOT, f), "utf8"); const nonce = randomBytes(16).toString("base64"); if (f === "index.html") html = html.replace("<head>", "<head>\n<script>window.HELM_BACKEND=1</script>"); html = html.replace(/<script>/g, `<script nonce="${nonce}">`); res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SEC_HEADERS, "content-security-policy": csp(nonce) }); res.end(html); };
createServer(async (req, res) => {
  const url = new URL(req.url, `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname === "/login" || url.pathname === "/join" || url.pathname === "/setup" || url.pathname === "/reset") return await page(res, "login.html");
    if (url.pathname === "/" || url.pathname === "/index.html") return await page(res, "index.html");
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    const f = join(ROOT, "public", url.pathname.replace(/\.\.+/g, ""));
    if (f.startsWith(join(ROOT, "public")) && existsSync(f)) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", ...SEC_HEADERS }); return res.end(await readFile(f)); }
    res.writeHead(404, SEC_HEADERS).end("Not found");
  } catch (e) {
    if (!res.headersSent) send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? "Too large" : e.code === 400 ? "Bad request" : "Server error" }, e.code === 413 ? { connection: "close" } : {});
    if (e.code === 413) res.on("finish", () => req.destroy()); // stop reading the rest of an oversized upload
    if (e.code !== 413 && e.code !== 400) console.error(e);
  }
}).listen(PORT, () => console.log(`Helm running at http://localhost:${PORT} (data in ${DATA})`));
