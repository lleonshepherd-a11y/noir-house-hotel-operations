// Passkeys (Face ID, Touch ID, Windows Hello, a phone or a security key) for signing in to Helm.
// Standard WebAuthn, checked here with Node's own crypto: no extra packages.
import { randomBytes, createHash, createPublicKey, verify } from "node:crypto";

const b64u = (b) => Buffer.from(b).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s || ""), "base64url");
const sha256 = (b) => createHash("sha256").update(b).digest();

// The small part of CBOR that passkeys use (numbers, bytes, text, lists, maps, true/false/null).
function cbor(buf) {
  let i = 0;
  const len = (ai) => { if (ai < 24) return ai; if (ai === 24) return buf[i++]; if (ai === 25) { const v = buf.readUInt16BE(i); i += 2; return v; } if (ai === 26) { const v = buf.readUInt32BE(i); i += 4; return v; } if (ai === 27) { const v = Number(buf.readBigUInt64BE(i)); i += 8; return v; } throw new Error("bad cbor"); };
  const item = () => {
    const b = buf[i++], mt = b >> 5, ai = b & 31;
    if (mt === 0) return len(ai);
    if (mt === 1) return -1 - len(ai);
    if (mt === 2) { const n = len(ai), v = buf.subarray(i, i + n); i += n; return v; }
    if (mt === 3) { const n = len(ai), v = buf.subarray(i, i + n).toString("utf8"); i += n; return v; }
    if (mt === 4) { const n = len(ai), a = []; for (let k = 0; k < n; k++) a.push(item()); return a; }
    if (mt === 5) { const n = len(ai), m = new Map(); for (let k = 0; k < n; k++) { const key = item(); m.set(key, item()); } return m; }
    if (mt === 7) return ai === 20 ? false : ai === 21 ? true : null;
    throw new Error("bad cbor");
  };
  return item();
}
// A COSE public key (what the passkey hands over) as a JWK Node can verify with.
function coseToJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && m.get(-1) === 1) return { alg: alg || -7, jwk: { kty: "EC", crv: "P-256", x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
  if (kty === 3) return { alg: alg || -257, jwk: { kty: "RSA", n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
  throw new Error("This passkey type isn’t supported.");
}
function parseAuthData(a) {
  const out = { rpIdHash: a.subarray(0, 32), flags: a[32], count: a.readUInt32BE(33) };
  if (out.flags & 0x40) { const n = a.readUInt16BE(53); out.credId = a.subarray(55, 55 + n); out.key = cbor(a.subarray(55 + n)); }
  return out;
}

export function makePasskeys({ db, q }) {
  db.exec("CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY, user_id INTEGER, jwk TEXT, alg INTEGER, count INTEGER, name TEXT, created INTEGER, last INTEGER)");
  const challenges = new Map(); // challenge → { kind, uid, exp }
  setInterval(() => { const now = Date.now(); for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k); }, 60e3).unref();
  const newChallenge = (kind, uid) => { const c = b64u(randomBytes(32)); challenges.set(c, { kind, uid, exp: Date.now() + 5 * 60e3 }); return c; };

  // Checks shared by adding and using a passkey: the right kind of request, a challenge we issued, this site.
  function checkClient(clientDataJSON, kind, origin) {
    let c; try { c = JSON.parse(fromB64u(clientDataJSON).toString("utf8")); } catch { throw new Error("That passkey response couldn’t be read."); }
    const ch = challenges.get(c.challenge); challenges.delete(c.challenge);
    if (c.type !== (kind === "add" ? "webauthn.create" : "webauthn.get") || !ch || ch.kind !== kind || ch.exp < Date.now()) throw new Error("That passkey request expired. Try again.");
    if (c.origin !== origin) throw new Error("That passkey is for a different site.");
    return ch;
  }
  const checkAuth = (ad, rpId) => { if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error("That passkey is for a different site."); if (!(ad.flags & 1)) throw new Error("The passkey wasn’t confirmed on the device."); };

  return {
    addOptions(u, rpId) {
      const have = q("SELECT id FROM passkeys WHERE user_id=?").all(u.id);
      return { challenge: newChallenge("add", u.id), rp: { id: rpId, name: "Helm" }, user: { id: b64u(Buffer.from("helm-" + u.id)), name: u.email, displayName: u.name },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], timeout: 120000, attestation: "none",
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" }, excludeCredentials: have.map((x) => ({ type: "public-key", id: x.id })) };
    },
    add(u, b, rpId, origin, name) {
      const ch = checkClient(b.clientDataJSON, "add", origin); if (ch.uid !== u.id) throw new Error("That passkey request expired. Try again.");
      const att = cbor(fromB64u(b.attestationObject)), ad = parseAuthData(att.get("authData")); checkAuth(ad, rpId);
      if (!ad.credId || !ad.key) throw new Error("The device didn’t send a passkey.");
      const { jwk, alg } = coseToJwk(ad.key); createPublicKey({ key: jwk, format: "jwk" }); // make sure the key is usable
      const id = b64u(ad.credId); if (q("SELECT 1 FROM passkeys WHERE id=?").get(id)) throw new Error("This passkey is already added.");
      q("INSERT INTO passkeys(id,user_id,jwk,alg,count,name,created,last) VALUES(?,?,?,?,?,?,?,?)").run(id, u.id, JSON.stringify(jwk), alg, ad.count, name, Date.now(), null);
      return id;
    },
    signInOptions(rpId) { return { challenge: newChallenge("use"), rpId, timeout: 120000, userVerification: "preferred" }; },
    // Returns the user id the passkey belongs to.
    use(b, rpId, origin) {
      checkClient(b.clientDataJSON, "use", origin);
      const pk = q("SELECT * FROM passkeys WHERE id=?").get(String(b.id || "")); if (!pk) throw new Error("This passkey isn’t linked to a Helm account. Sign in another way, then add it in Settings.");
      const raw = fromB64u(b.authenticatorData), ad = parseAuthData(raw); checkAuth(ad, rpId);
      const signed = Buffer.concat([raw, sha256(fromB64u(b.clientDataJSON))]);
      const key = createPublicKey({ key: JSON.parse(pk.jwk), format: "jwk" });
      if (!verify("sha256", signed, pk.alg === -7 ? { key, dsaEncoding: "der" } : key, fromB64u(b.signature))) throw new Error("That passkey didn’t match.");
      if (pk.count > 0 && ad.count <= pk.count) throw new Error("That passkey looks copied. Sign in another way.");
      q("UPDATE passkeys SET count=?, last=? WHERE id=?").run(ad.count, Date.now(), pk.id);
      return pk.user_id;
    },
    list: (uid) => q("SELECT id, name, created, last FROM passkeys WHERE user_id=? ORDER BY created").all(uid),
    remove: (uid, id) => q("DELETE FROM passkeys WHERE user_id=? AND id=?").run(uid, id).changes > 0,
    removeAll: (uid) => q("DELETE FROM passkeys WHERE user_id=?").run(uid),
  };
}
