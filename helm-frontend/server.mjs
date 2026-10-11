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
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { makeConnections } from "./connectors.mjs";

const scrypt = promisify(_scrypt);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA = process.env.DATA_DIR || join(ROOT, "data");
const FILES = join(DATA, "files");
const PORT = Number(process.env.PORT) || 5173;
const MAX_JSON = 5 * 1024 * 1024, MAX_FILE = 25 * 1024 * 1024;
await mkdir(FILES, { recursive: true });

/* ---------------- Database ---------------- */
const db = new DatabaseSync(join(DATA, "helm.db"));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, pkey TEXT UNIQUE, role TEXT, pass TEXT, invite TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS sections(name TEXT PRIMARY KEY, json TEXT, updated INTEGER, by INTEGER);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, owner INTEGER, area TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER, user_id INTEGER, what TEXT);`);
const q = (sql) => db.prepare(sql);
try { db.exec("ALTER TABLE files ADD COLUMN space TEXT"); } catch {} // which space a file was shared in
const getSetting = (k) => q("SELECT v FROM settings WHERE k=?").get(k)?.v;
const setSetting = (k, v) => q("INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);
const audit = (uid, what) => q("INSERT INTO audit(at,user_id,what) VALUES(?,?,?)").run(Date.now(), uid, what);

/* ---------------- Roles: who can read and write each part of the workspace ---------------- */
const STAFF = ["CEO", "Manager", "Member"], CEO = ["CEO"], MGR = ["CEO", "Manager"], ALL = ["CEO", "Manager", "Member", "Guest"];
const ACL = {
  TASKS: [ALL, STAFF], NOTES: [STAFF, STAFF], PROJ: [STAFF, MGR], SIDEP: [ALL, MGR], CEV: [STAFF, STAFF], ANN: [STAFF, MGR],
  TEAMP: [STAFF, CEO], MEM: [ALL, CEO], P: [ALL, CEO], SPX: [ALL, ALL], cnt: [ALL, STAFF], stamps: [ALL, STAFF], // SPX is merged per space below
  MROWS: [MGR, MGR], WK: [MGR, MGR], MET: [MGR, MGR],
  NY: [CEO, CEO], NYP: [CEO, CEO], SO: [CEO, CEO], SPSET: [ALL, CEO], STGS: [ALL, MGR], dec: [CEO, CEO], DECLOG: [CEO, CEO],
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
const FILE_AREA = { space: ALL, legal: CEO, dataroom: CEO, wages: CEO, project: STAFF };

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
  for (const k of ["mv", "ho", "ch"]) if (typeof t[k] === "string" && DATE_RE.test(t[k])) o[k] = t[k];
  return o;
}
// Members can add tasks and change their own; only managers and the CEO can change or remove other people's.
function mergeTasks(incoming, u) {
  const clean = (Array.isArray(incoming) ? incoming : []).map(cleanTask).filter(Boolean);
  if (u.role === "CEO" || u.role === "Manager") return clean;
  const cur = readSec("TASKS") || [], byId = new Map(clean.map((t) => [t.id, t]));
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
  return r;
}
function mergeCev(incoming, u) {
  const clean = (Array.isArray(incoming) ? incoming : []).map(cleanEv).filter(Boolean);
  if (u.role === "CEO") return clean;
  const cur = readSec("CEV") || [], keyOf = (e) => JSON.stringify(e.slice(0, 4));
  const curKeys = new Set(cur.map(keyOf));
  const keep = cur.filter((e) => isPrivateEv(e) || (u.role !== "Manager" && e[5] !== u.pkey));
  const mine = clean.filter((e) => !isPrivateEv(e) && (u.role === "Manager" || e[5] === u.pkey || !curKeys.has(keyOf(e))))
    .map((e) => { const r = e.slice(0, 4); r[2] = r[2] === "inv" || r[2] === "legal" ? "meet" : r[2]; r[4] = e[4] === "google" ? "" : (e[4] || ""); r[5] = e[5] && curKeys.has(keyOf(e)) ? e[5] : u.pkey; return r; });
  return [...keep, ...mine];
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
  if (k === "P" && v && typeof v === "object") { const o = {}; for (const [pk, x] of Object.entries(v)) if (isId(pk) && Array.isArray(x)) o[pk] = [noTags(x[0], 80), colorTok(x[1]), colorTok(x[2])]; return o; }
  if (k === "stamps" && v && typeof v === "object") { const o = {}; for (const [id, x] of Object.entries(v)) if (isId(id) && Array.isArray(x)) o[id] = [noTags(x[0], 40), noTags(x[1], 40)]; return o; }
  if (k === "cnt" && v && typeof v === "object") { const o = {}; for (const [id, x] of Object.entries(v)) o[noTags(id, 40)] = typeof x === "number" ? x : clamp(x); return o; }
  return v;
}

/* ---------------- Section storage ---------------- */
const readSec = (name) => { const r = q("SELECT json FROM sections WHERE name=?").get(name); return r ? JSON.parse(r.json) : undefined; };
const writeSec = (name, val, uid) => q("INSERT INTO sections(name,json,updated,by) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET json=excluded.json,updated=excluded.updated,by=excluded.by").run(name, JSON.stringify(val), Date.now(), uid);

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

function convsFor(u) {
  const all = readSec("CONVS") || [];
  return all.filter((c) => canSeeConv(c, u)).map((c) => {
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
function mergeConvs(incoming, u) {
  const all = readSec("CONVS") || [];
  const byId = new Map(all.map((c) => [c.ch ? c.id : "dm_" + convMembers(c).slice().sort().join("_"), c]));
  const key = (m) => JSON.stringify([m[0], m[1], m[2]]);
  for (const c of incoming || []) {
    if (!c || typeof c !== "object") continue;
    let id = c.id;
    if (!c.ch) { const parts = [u.pkey, c.dm].sort(); id = "dm_" + parts.join("_"); }
    let cur = byId.get(id);
    if (!cur) {
      if (c.ch && !canCreateSpace(u)) continue; // the CEO decides who can create spaces
      if (c.ch && (!isId(c.id) || c.id.startsWith("dm_"))) continue; // space ids are plain, and never look like a direct message
      if (!c.ch && !isId(c.dm)) continue;
      const ic = Array.isArray(c.ic) ? c.ic : [];
      if (c.ch) cur = { id: c.id, ch: noTags(c.ch, 80), ic: [noTags(ic[0], 2), colorTok(ic[1]), colorTok(ic[2])], desc: noTags(c.desc, 300), shared: c.shared ? noTags(c.shared === true ? "Shared" : c.shared, 80) : undefined, guests: Array.isArray(c.guests) ? c.guests.slice(0, 50).map((g) => noTags(g, 60)) : undefined, by: u.pkey, mem: Array.from(new Set([...(Array.isArray(c.mem) ? c.mem.filter(isId) : []), u.pkey])), unread: 0, msgs: [] };
      else cur = { id, dm: c.dm, parts: [u.pkey, c.dm], unread: 0, unreadBy: {}, msgs: [] };
      all.push(cur); byId.set(id, cur);
    } else if (!canSeeConv(cur, u)) continue;
    if (c.ch && Array.isArray(c.mem) && (cur.mem || []).includes(u.pkey)) cur.mem = Array.from(new Set(c.mem.filter(isId)));
    // archive state and last activity (archiving needs the same rights as creating, or being the creator)
    if (c.ch && (canCreateSpace(u) || cur.by === u.pkey)) { for (const k of ["arch", "archAuto", "flag"]) { if (c[k] === undefined || c[k] === null) delete cur[k]; else cur[k] = c[k]; } }
    if (c.ch && typeof c.last === "string" && /^\d{4}-\d\d-\d\d$/.test(c.last) && (!cur.last || c.last > cur.last)) cur.last = c.last;
    const have = new Set(cur.msgs.map(key));
    for (const m of c.msgs || []) {
      if (!Array.isArray(m)) continue;
      const k = key(m);
      if (have.has(k)) { const ex = cur.msgs.find((x) => key(x) === k); if (m[3] && m[3].rx) { ex[3] = ex[3] || {}; ex[3].rx = cleanRx(m[3].rx); } continue; }
      if (m[0] !== u.pkey && m[0] !== "sys") continue; // can't post as someone else
      cur.msgs.push([m[0], TIME_RE.test(String(m[1])) ? String(m[1]) : nowHM(), String(m[2]).slice(0, 8000), cleanMsgExtra(m[3])]);
      if (cur.ch && cur.arch && m[0] !== "sys") { delete cur.arch; delete cur.archAuto; delete cur.flag; } // posting reopens an archived space
      have.add(k);
      if (!cur.ch) { cur.unreadBy = cur.unreadBy || {}; for (const p of convMembers(cur)) if (p !== u.pkey) cur.unreadBy[p] = (cur.unreadBy[p] || 0) + 1; }
      else for (const p of cur.mem || []) if (p !== u.pkey) { cur.unreadBy = cur.unreadBy || {}; cur.unreadBy[p] = (cur.unreadBy[p] || 0) + 1; }
    }
    if ((c.unread | 0) === 0 && cur.unreadBy) cur.unreadBy[u.pkey] = 0;
  }
  writeSec("CONVS", all, u.id);
}

function stateFor(u) {
  const out = {};
  for (const r of q("SELECT name,json FROM sections").all()) {
    if (r.name === "CONVS" || !canRead(r.name, u.role)) continue;
    out[r.name] = JSON.parse(r.json);
  }
  out.CONVS = convsFor(u).map((c) => (c.ch ? { ...c, unread: (c.unreadBy || {})[u.pkey] || 0, unreadBy: undefined } : c));
  // Roles come from accounts, not from what a browser sent.
  if (out.MEM) out.MEM = out.MEM.map((m) => { const acc = q("SELECT role FROM users WHERE pkey=?").get(m[0]); return acc ? [m[0], acc.role] : m; });
  if (out.SPX && u.role !== "CEO") { const mine = new Set(convsFor(u).filter((c) => c.ch).map((c) => c.id)); out.SPX = Object.fromEntries(Object.entries(out.SPX).filter(([k]) => mine.has(k))); }
  if (u.role !== "CEO" && out.CEV) out.CEV = out.CEV.filter((e) => e[2] !== "inv" && e[2] !== "legal" && e[4] !== "google"); // the CEO's own Google Calendar stays private
  return swapKeys(out, "AK", u.pkey);
}

/* ---------------- Accounts and sessions ---------------- */
async function hashPw(pw) { const salt = randomBytes(16); const h = await scrypt(pw, salt, 64); return salt.toString("hex") + ":" + h.toString("hex"); }
async function checkPw(pw, stored) { if (!stored) return false; const [s, h] = stored.split(":"); const got = await scrypt(pw, Buffer.from(s, "hex"), 64); return timingSafeEqual(got, Buffer.from(h, "hex")); }
const SESSION_DAYS = 30;
function newSession(uid) { const t = randomBytes(32).toString("hex"); q("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(createHash("sha256").update(t).digest("hex"), uid, Date.now() + SESSION_DAYS * 864e5); return t; }
function userFrom(req) {
  const m = /(?:^|;\s*)helm_s=([a-f0-9]{64})/.exec(req.headers.cookie || ""); if (!m) return null;
  const r = q("SELECT u.* , s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?").get(createHash("sha256").update(m[1]).digest("hex"));
  if (!r || r.expires < Date.now()) return null; return r;
}
const cookie = (req, t, maxAge) => `helm_s=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.COOKIE_SECURE === "1" || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`;
const tries = new Map(); // simple login rate limit per IP
function tooMany(ip) { const t = tries.get(ip) || []; const now = Date.now(); const recent = t.filter((x) => now - x < 15 * 60e3); tries.set(ip, recent); return recent.length >= 10; }
const wagesOK = (u) => u.role === "CEO" || (u.role === "Manager" && ((readSec("WG") || {}).access || []).includes(u.pkey));
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, pkey: u.pkey, role: u.role });

/* ---------------- Live updates (server-sent events) ---------------- */
const clients = new Set();
function broadcast(evt, filter = () => true) { for (const c of clients) if (filter(c.user)) { try { c.res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch {} } }
setInterval(() => { for (const c of clients) try { c.res.write(": ping\n\n"); } catch {} }, 25e3);

const cx = makeConnections({ db, q, readSec, writeSec, getSetting, setSetting, audit, broadcast, DATA });

/* ---------------- HTTP helpers ---------------- */
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(obj)); };
function body(req, limit = MAX_JSON) {
  return new Promise((ok, bad) => { const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { bad(Object.assign(new Error("too large"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", bad); });
}
const json = async (req) => { const b = await body(req); try { return JSON.parse(b.toString() || "{}"); } catch { throw Object.assign(new Error("bad json"), { code: 400 }); } };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "SAMEORIGIN" };
const validEmail = (e) => typeof e === "string" && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const strongPw = (p) => typeof p === "string" && p.length >= 10 && p.length <= 200;
function nextKey(name) { const base = (String(name).match(/\b\w/g) || ["N", "N"]).join("").toUpperCase().slice(0, 2).padEnd(2, "X"); let k = base, i = 2; while (q("SELECT 1 FROM users WHERE pkey=?").get(k)) k = base[0] + i++; return k; }

/* ---------------- Routes ---------------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method, ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  // Every change must come from our own page (blocks cross-site form posts).
  if (m !== "GET" && req.headers["x-helm"] !== "1") return send(res, 403, { error: "Missing request header" });

  if (p === "/api/status" && m === "GET") return send(res, 200, { setup: !q("SELECT 1 FROM users LIMIT 1").get() });

  if (p === "/api/setup" && m === "POST") {
    if (q("SELECT 1 FROM users LIMIT 1").get()) return send(res, 409, { error: "Already set up" });
    const b = await json(req);
    if (!validEmail(b.email) || !strongPw(b.password) || !b.name) return send(res, 400, { error: "Enter your name, a valid email and a password of at least 10 characters." });
    const r = q("INSERT INTO users(email,name,pkey,role,pass,created) VALUES(?,?,?,?,?,?)").run(b.email.toLowerCase(), String(b.name).slice(0, 80), "AK", "CEO", await hashPw(b.password), Date.now());
    if (b.seed && typeof b.seed === "object") for (const [k, v] of Object.entries(b.seed)) if (k === "WG") { if (v) writeSec("WG", { access: v.access, rows: v.rows }, r.lastInsertRowid); } else if (ACL[k]) writeSec(k, v, r.lastInsertRowid);
    const P = readSec("P") || {}; P.AK = [String(b.name).slice(0, 80), (P.AK || [])[1] || "#1c1d21", (P.AK || [])[2] || "#fff"]; writeSec("P", P, r.lastInsertRowid);
    audit(r.lastInsertRowid, "set up the workspace");
    return send(res, 200, { ok: true }, { "set-cookie": cookie(req, newSession(r.lastInsertRowid), SESSION_DAYS * 86400) });
  }

  if (p === "/api/login" && m === "POST") {
    if (tooMany(ip)) return send(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    const b = await json(req); const u = q("SELECT * FROM users WHERE email=?").get(String(b.email || "").toLowerCase());
    if (!u || !(await checkPw(String(b.password || ""), u.pass))) { tries.get(ip)?.push(Date.now()) ?? tries.set(ip, [Date.now()]); return send(res, 401, { error: "Email or password is wrong." }); }
    return send(res, 200, { ok: true }, { "set-cookie": cookie(req, newSession(u.id), SESSION_DAYS * 86400) });
  }

  if (p === "/api/invite/accept" && m === "POST") {
    const b = await json(req); const u = b.token && q("SELECT * FROM users WHERE invite=?").get(String(b.token));
    if (!u) return send(res, 404, { error: "This invite link has expired or was already used." });
    if (!strongPw(b.password)) return send(res, 400, { error: "Use a password of at least 10 characters." });
    q("UPDATE users SET pass=?, invite=NULL, name=COALESCE(?,name) WHERE id=?").run(await hashPw(b.password), b.name ? String(b.name).slice(0, 80) : null, u.id);
    audit(u.id, "accepted invite");
    return send(res, 200, { ok: true }, { "set-cookie": cookie(req, newSession(u.id), SESSION_DAYS * 86400) });
  }
  if (p === "/api/invite/info" && m === "GET") { const u = q("SELECT name,email FROM users WHERE invite=?").get(url.searchParams.get("t") || ""); return u ? send(res, 200, u) : send(res, 404, { error: "Invite not found" }); }

  const u = userFrom(req);
  if (!u) return send(res, 401, { error: "Sign in" });

  if (p === "/api/logout" && m === "POST") { q("DELETE FROM sessions WHERE user_id=? AND token=?").run(u.id, createHash("sha256").update((/(?:^|;\s*)helm_s=([a-f0-9]{64})/.exec(req.headers.cookie) || [])[1] || "").digest("hex")); return send(res, 200, { ok: true }, { "set-cookie": cookie(req, "", 0) }); }
  if (p === "/api/me" && m === "GET") return send(res, 200, { ...pub(u), wages: wagesOK(u), seeded: !!q("SELECT 1 FROM sections WHERE name='TASKS'").get() });
  if (p === "/api/state" && m === "GET") return send(res, 200, stateFor(u));

  if (p === "/api/state" && m === "PUT") {
    const b = await json(req); const secs = swapKeys(b.sections || {}, "AK", u.pkey); const done = [], refused = [];
    for (let [k, v] of Object.entries(secs)) {
      if (k === "CONVS") { if (!readSec("CONVS") && u.role === "CEO") writeSec("CONVS", cleanSeedConvs(v), u.id); else mergeConvs(v, u); done.push(k); continue; }
      if (k === "TASKS") { if (!canWrite(k, u.role)) { refused.push(k); continue; } writeSec(k, mergeTasks(v, u), u.id); done.push(k); continue; }
      if (k === "CEV") { if (!canWrite(k, u.role)) { refused.push(k); continue; } writeSec(k, mergeCev(v, u), u.id); done.push(k); continue; }
      if (k === "SPX") { writeSec(k, mergeSpx(v, u), u.id); done.push(k); continue; }
      if (k === "WG") { if (u.role === "CEO" && !readSec("WG") && v) { writeSec("WG", { access: v.access, rows: v.rows }, u.id); done.push(k); } else refused.push(k); continue; }
      if (k === "MEM" && u.role === "CEO") { // role changes go to accounts too
        for (const [pk, role] of v || []) if (pk !== u.pkey && ["Manager", "Member", "Guest"].includes(role)) q("UPDATE users SET role=? WHERE pkey=? AND role<>'CEO'").run(role, pk);
      }
      if (!canWrite(k, u.role)) { refused.push(k); continue; }
      v = cleanSection(k, v);
      if (k === "ANN") cx.onAnnouncements(readSec("ANN"), v, u.name).catch(() => {});
      writeSec(k, v, u.id); done.push(k);
    }
    if (done.length) { audit(u.id, "updated " + done.join(", ")); broadcast({ type: "changed", sections: done, by: u.pkey }, (x) => x.id !== u.id); }
    return send(res, refused.length && !done.length ? 403 : 200, { saved: done, refused });
  }

  // Wages are role-based: the CEO, plus the people the CEO gives access to. No PIN.
  if (p === "/api/wages" && m === "GET") {
    if (!wagesOK(u)) return send(res, 403, { error: "You don’t have access to wages." });
    audit(u.id, "opened wages");
    return send(res, 200, swapKeys(readSec("WG") || { access: [u.pkey], rows: [] }, "AK", u.pkey));
  }
  if (p === "/api/wages" && m === "PUT") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the CEO can change wages." });
    const v = swapKeys(await json(req), "AK", u.pkey);
    const access = Array.from(new Set([u.pkey, ...(Array.isArray(v.access) ? v.access.map(String) : [])]));
    writeSec("WG", { access, rows: Array.isArray(v.rows) ? v.rows : [] }, u.id); audit(u.id, "updated wages");
    broadcast({ type: "wages" });
    return send(res, 200, { ok: true });
  }

  if (p === "/api/users" && m === "GET") { if (u.role !== "CEO") return send(res, 403, { error: "CEO only" }); return send(res, 200, q("SELECT id,email,name,pkey,role, invite IS NOT NULL AS pending FROM users").all().map((x) => swapKeys(x, "AK", u.pkey))); }
  if (p === "/api/invite" && m === "POST") {
    if (u.role !== "CEO") return send(res, 403, { error: "Only the CEO can invite people." });
    const b = await json(req); if (!validEmail(b.email)) return send(res, 400, { error: "Enter a valid email." });
    const role = ["Manager", "Member", "Guest"].includes(b.role) ? b.role : "Member";
    if (q("SELECT 1 FROM users WHERE email=?").get(b.email.toLowerCase())) return send(res, 409, { error: "That person already has an account." });
    let pkey = b.pkey ? swapKeys(String(b.pkey), "AK", u.pkey) : null;
    if (pkey && q("SELECT 1 FROM users WHERE pkey=?").get(pkey)) return send(res, 409, { error: "That team member already has an account." });
    const P = readSec("P") || {};
    if (!pkey) { pkey = nextKey(b.name || b.email); P[pkey] = [String(b.name || b.email.split("@")[0]).slice(0, 80), "#efeff1", "#3f4148"]; writeSec("P", P, u.id); const mem = readSec("MEM") || []; mem.push([pkey, role]); writeSec("MEM", mem, u.id); }
    const token = randomBytes(24).toString("hex");
    q("INSERT INTO users(email,name,pkey,role,invite,created) VALUES(?,?,?,?,?,?)").run(b.email.toLowerCase(), (P[pkey] || [b.name])[0], pkey, role, token, Date.now());
    audit(u.id, "invited " + b.email + " as " + role);
    return send(res, 200, { link: `${url.origin}/join?t=${token}`, pkey: swapKeys(pkey, "AK", u.pkey) });
  }

  if (p === "/api/files" && m === "POST") {
    const area = url.searchParams.get("area") || "space"; if (!FILE_AREA[area]?.includes(u.role)) return send(res, 403, { error: "Not allowed" });
    let space = null;
    if (area === "space") { space = url.searchParams.get("space"); const conv = (readSec("CONVS") || []).find((c) => c.ch && c.id === space); if (!conv || !canSeeConv(conv, u)) return send(res, 403, { error: "You’re not in that space." }); }
    let name = "file"; try { name = decodeURIComponent(req.headers["x-file-name"] || "file"); } catch {}
    name = name.replace(/[\\/\0<>]/g, "_").slice(0, 200);
    const buf = await body(req, MAX_FILE); const id = randomBytes(16).toString("hex");
    await writeFile(join(FILES, id), buf);
    q("INSERT INTO files(id,name,mime,size,owner,area,created,space) VALUES(?,?,?,?,?,?,?,?)").run(id, name, String(req.headers["content-type"] || "application/octet-stream").slice(0, 100), buf.length, u.id, area, Date.now(), space);
    audit(u.id, "uploaded " + name);
    return send(res, 200, { id, url: "/api/files/" + id, size: buf.length });
  }
  const fm = /^\/api\/files\/([a-f0-9]{32})$/.exec(p);
  if (fm && m === "GET") {
    const f = q("SELECT * FROM files WHERE id=?").get(fm[1]); if (!f || !FILE_AREA[f.area]?.includes(u.role)) return send(res, 404, { error: "Not found" });
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

/* ---------------- Accountability: hourly check for stuck tasks ---------------- */
// Tasks store due dates as short labels ("Oct 20", "Fri", "Today"). This mirrors the app's reading of them.
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dueISO(d, now = new Date()) {
  if (!d) return null; const pad = (n) => String(n).padStart(2, "0"); const iso = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  if (d === "Today") return iso(now);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d); if (wd >= 0) { const x = new Date(now); x.setDate(x.getDate() + ((wd - x.getDay() + 7) % 7)); return iso(x); }
  let m = /^([A-Z][a-z]{2}) (\d+)$/.exec(d) || /^(\d+) ([A-Z][a-z]{2})$/.exec(d); if (!m) return null;
  const [mon, day] = isNaN(m[1]) ? [m[1], +m[2]] : [m[2], +m[1]]; const mi = MON3.indexOf(mon); if (mi < 0) return null;
  let y = now.getFullYear(); if (mi < now.getMonth() - 6) y++; return `${y}-${pad(mi + 1)}-${pad(day)}`;
}
async function accountabilityCheck() {
  const tasks = readSec("TASKS") || [], P = readSec("P") || {}, today = new Date(); today.setHours(0, 0, 0, 0);
  const sent = JSON.parse(getSetting("acct_sent") || "{}"), day = today.toISOString().slice(0, 10), out = [];
  for (const t of tasks) {
    if (!t || t.s === "done") continue; const due = dueISO(t.d); if (!due) continue;
    const late = Math.round((today - new Date(due + "T00:00")) / 864e5); if (late < 5) continue;
    const key = t.id + ":" + day; if (sent[key]) continue; sent[key] = 1;
    out.push(`*${t.id}* ${t.t} is ${late} days late with ${String((P[t.o] || [t.o])[0]).replace(/\.$/, "")}.`);
  }
  if (out.length) { const ok = await cx.notify(":rotating_light: *Stuck tasks*\n" + out.join("\n") + "\n_Open Helm to chase or reassign._"); if (ok) audit(null, "posted stuck tasks to Slack"); }
  for (const k of Object.keys(sent)) if (!k.endsWith(day)) delete sent[k];
  setSetting("acct_sent", JSON.stringify(sent));
}
setInterval(() => accountabilityCheck().catch(() => {}), 60 * 60e3).unref();
setTimeout(() => accountabilityCheck().catch(() => {}), 15e3).unref();

const csp = (n) => `default-src 'self'; script-src 'nonce-${n}' https://cdn.plaid.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'self' blob:; frame-src https://cdn.plaid.com; connect-src 'self' https://*.plaid.com; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`;
const page = async (res, f) => { let html = await readFile(join(ROOT, f), "utf8"); const nonce = randomBytes(16).toString("base64"); if (f === "index.html") html = html.replace("<head>", "<head>\n<script>window.HELM_BACKEND=1</script>"); html = html.replace(/<script>/g, `<script nonce="${nonce}">`); res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SEC_HEADERS, "content-security-policy": csp(nonce) }); res.end(html); };
createServer(async (req, res) => {
  const url = new URL(req.url, `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname === "/login" || url.pathname === "/join" || url.pathname === "/setup") return await page(res, "login.html");
    if (url.pathname === "/" || url.pathname === "/index.html") return await page(res, "index.html");
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    const f = join(ROOT, "public", url.pathname.replace(/\.\.+/g, ""));
    if (f.startsWith(join(ROOT, "public")) && existsSync(f)) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", ...SEC_HEADERS }); return res.end(await readFile(f)); }
    res.writeHead(404, SEC_HEADERS).end("Not found");
  } catch (e) {
    if (!res.headersSent) send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? "Too large" : e.code === 400 ? "Bad request" : "Server error" });
    if (!e.code) console.error(e);
  }
}).listen(PORT, () => console.log(`Helm running at http://localhost:${PORT} (data in ${DATA})`));
