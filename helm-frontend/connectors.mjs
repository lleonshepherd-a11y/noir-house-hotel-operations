// Helm connections: Gmail, Google Calendar, Google Drive, QuickBooks, Xero,
// bank accounts (Plaid) and Stripe. Read-only: Helm never moves money
// or changes anything in these tools.
//
// OAuth apps (client ID and secret) come from environment variables, or the CEO
// pastes them in on the Connections page. Tokens are encrypted at rest with
// AES-256-GCM using HELM_SECRET (or a key generated in DATA_DIR).
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Tests point every provider at a local mock server. Never set this in production.
const MOCK = process.env.HELM_MOCK_PROVIDERS;
const U = (url) => (MOCK ? MOCK + "/" + url.replace(/^https:\/\//, "") : url);

export const APPS = {
  google: {
    name: "Google", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], console: "https://console.cloud.google.com/apis/credentials",
    auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    extra: { access_type: "offline", prompt: "consent" },
    help: "In Google Cloud, create an OAuth client (type: Web application). Turn on the Gmail API, Google Calendar API and Google Drive API for the project.",
  },
  intuit: {
    name: "Intuit QuickBooks", env: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"], console: "https://developer.intuit.com/app/developer/dashboard",
    auth: "https://appcenter.intuit.com/connect/oauth2", token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", basic: true,
    help: "In the Intuit Developer portal, create an app with the Accounting scope and copy its Client ID and Client Secret.",
  },
  xero: {
    name: "Xero", env: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"], console: "https://developer.xero.com/app/manage",
    auth: "https://login.xero.com/identity/connect/authorize", token: "https://identity.xero.com/connect/token", basic: true,
    help: "In Xero Developer, create a Web app and copy its Client ID and a Client Secret.",
  },
  plaid: {
    name: "Plaid", env: ["PLAID_CLIENT_ID", "PLAID_SECRET"], console: "https://dashboard.plaid.com/developers/keys",
    help: "Plaid links your bank. Copy the Client ID and the Secret for the environment you use (sandbox or production).",
  },
};

export const CONNECTORS = {
  gmail: { app: "google", kind: "oauth", name: "Gmail", scope: "https://www.googleapis.com/auth/gmail.readonly" },
  gcal: { app: "google", kind: "oauth", name: "Google Calendar", scope: "https://www.googleapis.com/auth/calendar.readonly" },
  drive: { app: "google", kind: "oauth", name: "Google Drive", scope: "https://www.googleapis.com/auth/drive.metadata.readonly" },
  qb: { app: "intuit", kind: "oauth", name: "QuickBooks", scope: "com.intuit.quickbooks.accounting" },
  xero: { app: "xero", kind: "oauth", name: "Xero", scope: process.env.XERO_SCOPES || "offline_access accounting.reports.read accounting.settings.read" },
  bank: { app: "plaid", kind: "plaid", name: "Business bank account" },
  stripe: { kind: "key", name: "Stripe", label: "Stripe restricted key (read-only)", hint: "In Stripe, go to Developers → API keys → Create restricted key. Give it Read access to Subscriptions and Prices. It starts with rk_live_." },
};

export function makeConnections({ db, q, readSec, writeSec, getSetting, setSetting, audit, broadcast, DATA }) {
  db.exec("CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY, secret TEXT, account TEXT, status TEXT, last_sync INTEGER, error TEXT, created INTEGER)");
  // Tools Helm no longer offers: drop their saved keys and status so nothing is left behind.
  for (const r of q("SELECT id FROM connections").all()) if (!CONNECTORS[r.id]) q("DELETE FROM connections WHERE id=?").run(r.id);
  { const cx = readSec("CX"); if (cx && Object.keys(cx).some((k) => !CONNECTORS[k])) writeSec("CX", Object.fromEntries(Object.entries(cx).filter(([k]) => CONNECTORS[k])), null); }

  /* ---------- Encryption for tokens and app secrets ---------- */
  let keySrc = process.env.HELM_SECRET;
  if (!keySrc) { const f = join(DATA, "secret.key"); if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString("hex"), { mode: 0o600 }); keySrc = readFileSync(f, "utf8").trim(); }
  const KEY = createHash("sha256").update(keySrc).digest();
  const enc = (obj) => { const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", KEY, iv); const ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64"); };
  const dec = (s) => { if (!s) return null; try { const b = Buffer.from(s, "base64"); const d = createDecipheriv("aes-256-gcm", KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString()); } catch { return null; } };

  /* ---------- App credentials ---------- */
  function appCreds(app) {
    const A = APPS[app]; if (!A) return null;
    const [i, s] = A.env; if (process.env[i] && process.env[s]) return { clientId: process.env[i], clientSecret: process.env[s], env: process.env.PLAID_ENV || process.env.QUICKBOOKS_ENV, from: "env" };
    const v = dec(getSetting("app_" + app)); return v ? { ...v, from: "settings" } : null;
  }
  const plaidHost = () => { const e = (appCreds("plaid") || {}).env || "production"; return `https://${e === "sandbox" ? "sandbox" : "production"}.plaid.com`; };
  const qbHost = () => ((appCreds("intuit") || {}).env === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");

  /* ---------- Stored connections ---------- */
  const row = (id) => q("SELECT * FROM connections WHERE id=?").get(id);
  const save = (id, f) => {
    const r = row(id) || { id, created: Date.now() };
    const n = { ...r, ...f }; if (f.secret !== undefined) n.secret = f.secret === null ? null : enc(f.secret);
    q("INSERT INTO connections(id,secret,account,status,last_sync,error,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,account=excluded.account,status=excluded.status,last_sync=excluded.last_sync,error=excluded.error")
      .run(id, n.secret ?? null, n.account ?? null, n.status ?? null, n.last_sync ?? null, n.error ?? null, n.created ?? Date.now());
  };
  const secretOf = (id) => dec(row(id)?.secret);

  /* ---------- HTTP to providers ---------- */
  class ProviderError extends Error { constructor(msg, status, auth) { super(msg); this.status = status; this.auth = auth; } }
  async function call(url, opt = {}) {
    let r;
    try { r = await fetch(U(url), { ...opt, signal: AbortSignal.timeout(20e3) }); }
    catch (e) { throw new ProviderError("Couldn’t reach the service. Try again in a minute.", 0); }
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) {
      const m = j.error_description || j.error?.message || j.error_message || (typeof j.error === "string" ? j.error : "") || j.Detail || j.message || j.Fault?.Error?.[0]?.Detail || `Error ${r.status}`;
      throw new ProviderError(String(m).slice(0, 300), r.status, r.status === 401 || /invalid_grant|expired|revoked/i.test(m));
    }
    return j;
  }
  const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();

  async function tokenRequest(app, params) {
    const A = APPS[app], c = appCreds(app);
    if (!c) throw new ProviderError(`${A.name} isn’t set up yet.`, 400);
    const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (A.basic) headers.authorization = "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
    else Object.assign(params, { client_id: c.clientId, client_secret: c.clientSecret });
    return call(A.token, { method: "POST", headers, body: form(params) });
  }
  // A valid access token for an OAuth connection, refreshing it when it's about to run out.
  async function accessToken(id) {
    const s = secretOf(id); if (!s) throw new ProviderError("Not connected", 400, true);
    if (s.exp && s.exp > Date.now() + 60e3) return s;
    if (!s.refresh) throw new ProviderError("The sign-in ran out. Connect again.", 401, true);
    const t = await tokenRequest(CONNECTORS[id].app, { grant_type: "refresh_token", refresh_token: s.refresh });
    const n = { ...s, access: t.access_token, refresh: t.refresh_token || s.refresh, exp: Date.now() + (t.expires_in || 3600) * 1000 };
    save(id, { secret: n }); return n;
  }
  const bearer = (t, extra = {}) => ({ headers: { authorization: "Bearer " + t.access, accept: "application/json", ...extra } });

  /* ---------- What each connection reads ---------- */
  const setCX = (k, v) => { const cx = readSec("CX") || {}; if (v === undefined) delete cx[k]; else cx[k] = v; writeSec("CX", cx, null); };
  const setAccRows = (src, rows) => { const acc = (readSec("MNY_acc") || []).filter((a) => a[3] !== src); writeSec("MNY_acc", [...acc, ...rows.map((r) => [...r, src])], null); };
  const hdr = (m, n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n)?.value || "";
  const G = "https://gmail.googleapis.com/gmail/v1/users/me";

  const SYNC = {
    async gmail() {
      const t = await accessToken("gmail");
      const inbox = await call(G + "/labels/INBOX", bearer(t));
      const list = await call(G + "/messages?maxResults=8&q=" + encodeURIComponent("in:inbox"), bearer(t));
      const recent = [];
      for (const m of (list.messages || []).slice(0, 8)) {
        const x = await call(`${G}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, bearer(t));
        recent.push({ id: x.id, from: hdr(x, "from").replace(/\s*<[^>]+>$/, "").replace(/^"|"$/g, "").slice(0, 80), subject: hdr(x, "subject").slice(0, 200) || "(no subject)", date: new Date(Number(x.internalDate) || Date.parse(hdr(x, "date")) || Date.now()).toISOString(), snippet: String(x.snippet || "").slice(0, 200), unread: (x.labelIds || []).includes("UNREAD") });
      }
      setCX("gmail", { unread: inbox.messagesUnread || 0, recent }); return ["CX"];
    },
    async gcal() {
      const t = await accessToken("gcal");
      const min = new Date(Date.now() - 7 * 864e5).toISOString(), max = new Date(Date.now() + 60 * 864e5).toISOString();
      const j = await call(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}`, bearer(t));
      const evs = (j.items || []).filter((e) => e.status !== "cancelled").map((e) => {
        const dt = e.start?.dateTime, d = (dt || e.start?.date || "").slice(0, 10);
        const where = e.location ? String(e.location).split(",")[0].slice(0, 40) : e.hangoutLink || e.conferenceData ? "Video call" : "";
        return [d, String(e.summary || "Busy").slice(0, 120), "meet", [dt ? dt.slice(11, 16) : "All day", where].filter(Boolean).join(" · "), "google"];
      }).filter((e) => /^\d{4}-\d\d-\d\d$/.test(e[0]));
      const cev = (readSec("CEV") || []).filter((e) => e[4] !== "google");
      writeSec("CEV", [...cev, ...evs], null); setCX("gcal", { events: evs.length }); return ["CEV", "CX"];
    },
    async drive() {
      const t = await accessToken("drive");
      const j = await call("https://www.googleapis.com/drive/v3/files?pageSize=15&orderBy=modifiedTime%20desc&q=trashed%3Dfalse&fields=files(id,name,mimeType,modifiedTime,webViewLink)", bearer(t));
      setCX("drive", { files: (j.files || []).map((f) => ({ name: String(f.name).slice(0, 160), type: String(f.mimeType || "").split(/[./]/).pop(), modified: f.modifiedTime, link: f.webViewLink })) }); return ["CX"];
    },
    async qb() {
      const t = await accessToken("qb");
      const j = await call(`${qbHost()}/v3/company/${t.realmId}/query?minorversion=75&query=${encodeURIComponent("select * from Account where AccountType = 'Bank' and Active = true")}`, bearer(t));
      const accs = (j.QueryResponse?.Account || []).map((a) => [String(a.Name).slice(0, 80), "QuickBooks · " + (a.AccountSubType || "Bank").replace(/([a-z])([A-Z])/g, "$1 $2"), Math.round(Number(a.CurrentBalance) || 0)]);
      setAccRows("qb", accs); setCX("qb", { accounts: accs.length }); return ["MNY_acc", "CX"];
    },
    async xero() {
      const t = await accessToken("xero");
      const j = await call("https://api.xero.com/api.xro/2.0/Reports/BankSummary", bearer(t, { "xero-tenant-id": t.tenantId }));
      const rows = []; const walk = (rs) => { for (const r of rs || []) { if (r.RowType === "Row" && r.Cells?.length >= 5) rows.push([String(r.Cells[0].Value).slice(0, 80), "Xero · Bank", Math.round(Number(r.Cells[4].Value) || 0)]); if (r.Rows) walk(r.Rows); } };
      walk(j.Reports?.[0]?.Rows); setAccRows("xero", rows); setCX("xero", { accounts: rows.length }); return ["MNY_acc", "CX"];
    },
    async bank() {
      const s = secretOf("bank"), c = appCreds("plaid"); if (!s || !c) throw new ProviderError("Not connected", 400, true);
      const j = await call(plaidHost() + "/accounts/balance/get", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.clientId, secret: c.clientSecret, access_token: s.access }) });
      const accs = (j.accounts || []).filter((a) => a.type === "depository").map((a) => [String(a.official_name || a.name).slice(0, 80), `${s.institution || "Bank"} · ${a.subtype || "account"}${a.mask ? " ··" + a.mask : ""}`, Math.round(Number(a.balances?.current ?? a.balances?.available) || 0)]);
      setAccRows("bank", accs); setCX("bank", { accounts: accs.length }); return ["MNY_acc", "CX"];
    },
    async stripe() {
      const s = secretOf("stripe"); if (!s) throw new ProviderError("Not connected", 400, true);
      const per = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };
      let mrr = 0, subs = 0, after = null;
      for (let page = 0; page < 20; page++) {
        const j = await call("https://api.stripe.com/v1/subscriptions?status=active&limit=100&expand[]=data.discount" + (after ? "&starting_after=" + after : ""), { headers: { authorization: "Bearer " + s.key } });
        for (const sub of j.data || []) {
          subs++; let m = 0;
          for (const it of sub.items?.data || []) { const p = it.price || it.plan || {}; const rec = p.recurring || { interval: p.interval, interval_count: p.interval_count }; m += ((p.unit_amount ?? p.amount ?? 0) * (it.quantity || 1) * (per[rec.interval] || 1)) / (rec.interval_count || 1); }
          const pct = sub.discount?.coupon?.percent_off; if (pct) m *= 1 - pct / 100;
          mrr += m;
        }
        if (!j.has_more || !j.data?.length) break; after = j.data[j.data.length - 1].id;
      }
      mrr = Math.round(mrr / 100);
      const n = readSec("MNYn") || {}; const month = new Date().toISOString().slice(0, 7); const cx = (readSec("CX") || {}).stripe;
      if (cx && cx.month !== month && n.mrr != null) n.mrrPrev = n.mrr;
      n.mrr = mrr; writeSec("MNYn", n, null); setCX("stripe", { mrr, subs, month }); return ["MNYn", "CX"];
    },
  };

  async function sync(id, by = null) {
    const fn = SYNC[id]; if (!fn) return;
    try {
      const secs = await fn(); save(id, { status: "on", last_sync: Date.now(), error: null });
      broadcast({ type: "changed", sections: secs, by: "sys" }); return { ok: true };
    } catch (e) {
      save(id, { status: e.auth ? "expired" : "error", error: e.message });
      if (by) audit(by, `sync ${id} failed: ${e.message}`);
      broadcast({ type: "connections" }); return { ok: false, error: e.message };
    }
  }
  setInterval(() => { for (const r of q("SELECT id FROM connections WHERE status IN ('on','error')").all()) sync(r.id).catch(() => {}); }, 30 * 60e3).unref();

  /* ---------- What the Connections page shows ---------- */
  const origin = (url) => (process.env.PUBLIC_URL || url.origin).replace(/\/$/, "");
  const redirectFor = (app, url) => `${origin(url)}/api/connect/callback/${app}`;
  function list(url) {
    const apps = {};
    for (const [k, A] of Object.entries(APPS)) { const c = appCreds(k); apps[k] = { name: A.name, ready: !!c, from: c?.from || null, env: A.env, console: A.console, help: A.help, redirect: k === "plaid" ? null : redirectFor(k, url), plaidEnv: k === "plaid" ? c?.env || "production" : undefined }; }
    const conns = {};
    for (const [id, C] of Object.entries(CONNECTORS)) {
      const r = row(id);
      conns[id] = { id, name: C.name, kind: C.kind, app: C.app || null, label: C.label, hint: C.hint, ready: C.app ? apps[C.app].ready : true,
        status: r?.status || "off", account: r?.account || null, lastSync: r?.last_sync || null, error: r?.error || null };
    }
    return { apps, conns };
  }

  const states = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of states) if (v.exp < now) states.delete(k); }, 60e3).unref();

  const send = (res, code, obj, headers = {}) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers }); res.end(JSON.stringify(obj)); };
  const back = (res, url, id, err) => { res.writeHead(302, { location: `${origin(url)}/?cx=${encodeURIComponent(id || "")}&cxr=${err ? encodeURIComponent(err.slice(0, 200)) : "ok"}#connections` }); res.end(); };

  // Returns true if it handled the request.
  async function route(req, res, url, u, json) {
    const p = url.pathname, m = req.method;
    if (!p.startsWith("/api/connect")) return false;
    if (u.role !== "CEO") { if (p.startsWith("/api/connect/callback/")) return back(res, url, "", "Only the CEO can connect tools."), true; send(res, 403, { error: "Only the CEO can manage connections." }); return true; }

    if (p === "/api/connect" && m === "GET") { send(res, 200, list(url)); return true; }

    let mm = /^\/api\/connect\/app\/(\w+)$/.exec(p);
    if (mm && m === "POST") {
      const app = mm[1]; if (!APPS[app]) { send(res, 404, { error: "Unknown app" }); return true; }
      const b = await json(req);
      if (b.remove) { setSetting("app_" + app, ""); audit(u.id, "removed " + app + " app keys"); send(res, 200, list(url)); return true; }
      const clientId = String(b.clientId || "").trim(), clientSecret = String(b.clientSecret || "").trim();
      if (clientId.length < 6 || clientSecret.length < 6 || clientId.length > 300 || clientSecret.length > 300) { send(res, 400, { error: "Paste both the Client ID and the Client Secret." }); return true; }
      setSetting("app_" + app, enc({ clientId, clientSecret, env: b.env === "sandbox" ? "sandbox" : b.env === "production" ? "production" : undefined }));
      audit(u.id, "saved " + app + " app keys"); send(res, 200, list(url)); return true;
    }

    mm = /^\/api\/connect\/(\w+)\/start$/.exec(p);
    if (mm && m === "GET") {
      const id = mm[1], C = CONNECTORS[id]; if (!C || C.kind !== "oauth") { back(res, url, id, "That tool can’t be connected this way."); return true; }
      const A = APPS[C.app], c = appCreds(C.app); if (!c) { back(res, url, id, `Add the ${A.name} app keys first.`); return true; }
      const state = randomBytes(18).toString("hex"); states.set(state, { id, uid: u.id, exp: Date.now() + 10 * 60e3 });
      const qs = form({ client_id: c.clientId, redirect_uri: redirectFor(C.app, url), response_type: "code", scope: C.scope, state, ...(A.extra || {}) });
      res.writeHead(302, { location: U(A.auth) + "?" + qs }); res.end(); return true;
    }

    mm = /^\/api\/connect\/callback\/(\w+)$/.exec(p);
    if (mm && m === "GET") {
      const app = mm[1], st = states.get(url.searchParams.get("state") || ""); states.delete(url.searchParams.get("state") || "");
      if (!st || st.uid !== u.id || CONNECTORS[st.id]?.app !== app) { back(res, url, st?.id, "That sign-in link expired. Try again."); return true; }
      const err = url.searchParams.get("error"); if (err) { back(res, url, st.id, err === "access_denied" ? "You cancelled the sign-in." : err); return true; }
      try {
        const t = await tokenRequest(app, { grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: redirectFor(app, url) });
        const sec = { access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 3600) * 1000 };
        let account = null;
        if (app === "google") {
          if (st.id === "gmail") account = (await call(G + "/profile", bearer(sec))).emailAddress;
          else if (st.id === "gcal") account = (await call("https://www.googleapis.com/calendar/v3/calendars/primary", bearer(sec))).id;
          else account = (await call("https://www.googleapis.com/drive/v3/about?fields=user", bearer(sec))).user?.emailAddress;
        } else if (app === "intuit") {
          sec.realmId = url.searchParams.get("realmId"); if (!sec.realmId) throw new ProviderError("QuickBooks didn’t say which company to use.", 400);
          account = (await call(`${qbHost()}/v3/company/${sec.realmId}/companyinfo/${sec.realmId}?minorversion=75`, bearer(sec))).CompanyInfo?.CompanyName;
        } else if (app === "xero") {
          const ts = await call("https://api.xero.com/connections", bearer(sec)); const tn = (ts || []).find((x) => x.tenantType === "ORGANISATION") || ts?.[0];
          if (!tn) throw new ProviderError("No Xero organisation was shared with Helm.", 400);
          sec.tenantId = tn.tenantId; sec.connectionId = tn.id; account = tn.tenantName;
        }
        save(st.id, { secret: sec, account: account ? String(account).slice(0, 120) : null, status: "on", error: null });
        audit(u.id, "connected " + st.id);
        const r = await sync(st.id, u.id);
        back(res, url, st.id, r.ok ? null : "Connected, but the first sync failed: " + r.error);
      } catch (e) { back(res, url, st.id, e.message || "Connecting failed."); }
      return true;
    }

    // Plaid: make a Link token, then swap the public token for an access token.
    if (p === "/api/connect/bank/link" && m === "POST") {
      const c = appCreds("plaid"); if (!c) { send(res, 400, { error: "Add the Plaid keys first." }); return true; }
      try {
        const j = await call(plaidHost() + "/link/token/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.clientId, secret: c.clientSecret, client_name: "Helm", language: "en", country_codes: (process.env.PLAID_COUNTRIES || "US,GB").split(","), user: { client_user_id: "helm-" + u.id }, products: ["transactions"] }) });
        send(res, 200, { link_token: j.link_token });
      } catch (e) { send(res, 502, { error: e.message }); }
      return true;
    }
    if (p === "/api/connect/bank/exchange" && m === "POST") {
      const c = appCreds("plaid"), b = await json(req); if (!c) { send(res, 400, { error: "Add the Plaid keys first." }); return true; }
      try {
        const j = await call(plaidHost() + "/item/public_token/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.clientId, secret: c.clientSecret, public_token: String(b.public_token || "") }) });
        const inst = String(b.institution || "").slice(0, 60) || "Bank";
        save("bank", { secret: { access: j.access_token, item: j.item_id, institution: inst }, account: inst, status: "on", error: null });
        audit(u.id, "connected bank"); const r = await sync("bank", u.id);
        send(res, 200, { ...list(url), ok: r.ok, error: r.error });
      } catch (e) { send(res, 502, { error: e.message }); }
      return true;
    }

    mm = /^\/api\/connect\/(\w+)\/key$/.exec(p);
    if (mm && m === "POST") {
      const id = mm[1], C = CONNECTORS[id]; if (!C || C.kind !== "key") { send(res, 404, { error: "Unknown tool" }); return true; }
      const key = String((await json(req)).key || "").trim();
      if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]{10,}$/.test(key)) { send(res, 400, { error: "That doesn’t look like a Stripe key. It starts with rk_live_ or sk_live_." }); return true; }
      save("stripe", { secret: { key }, account: key.includes("_test_") ? "Test mode" : "Live", status: "on", error: null });
      const r = await sync("stripe", u.id);
      if (!r.ok) { save("stripe", { secret: null, status: "off", error: null, account: null }); send(res, 400, { error: "Stripe said: " + r.error }); return true; }
      audit(u.id, "connected " + id); send(res, 200, list(url)); return true;
    }

    mm = /^\/api\/connect\/(\w+)\/sync$/.exec(p);
    if (mm && m === "POST") { if (!row(mm[1])) { send(res, 404, { error: "Not connected" }); return true; } const r = await sync(mm[1], u.id); send(res, r.ok ? 200 : 502, { ...list(url), error: r.error }); return true; }

    mm = /^\/api\/connect\/(\w+)$/.exec(p);
    if (mm && m === "DELETE") {
      const id = mm[1]; if (!CONNECTORS[id]) { send(res, 404, { error: "Unknown tool" }); return true; }
      const s = secretOf(id);
      try { // best effort: tell the provider too
        // Google ends the whole grant (Gmail, Calendar and Drive together) when any one token is revoked,
        // so only revoke when this is the last Google tool still connected.
        const otherGoogle = Object.keys(CONNECTORS).some((k) => k !== id && CONNECTORS[k].app === "google" && row(k));
        if (s && CONNECTORS[id].app === "google" && !otherGoogle) await call("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ token: s.refresh || s.access }) });
        if (s && id === "xero" && s.connectionId) await call("https://api.xero.com/connections/" + s.connectionId, { method: "DELETE", headers: { authorization: "Bearer " + (await accessToken("xero")).access } });
        if (s && id === "bank") { const c = appCreds("plaid"); if (c) await call(plaidHost() + "/item/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: c.clientId, secret: c.clientSecret, access_token: s.access }) }); }
      } catch {}
      q("DELETE FROM connections WHERE id=?").run(id);
      const secs = ["CX"];
      if (id === "gcal") { writeSec("CEV", (readSec("CEV") || []).filter((e) => e[4] !== "google"), null); secs.push("CEV"); }
      if (["qb", "xero", "bank"].includes(id)) { setAccRows(id, []); secs.push("MNY_acc"); }
      setCX(id, undefined); audit(u.id, "disconnected " + id);
      broadcast({ type: "changed", sections: secs, by: "sys" }); send(res, 200, list(url)); return true;
    }
    send(res, 404, { error: "Not found" }); return true;
  }

  return { route };
}
