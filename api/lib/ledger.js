// lib/ledger.js: the Epilogue. Reads the file audit log of all three nodes
// (read-only mounts; the node that serves a request logs it, probe P26),
// incrementally by byte offset, keeps the story entries of namespace
// governor, and maps each to a story event. HMAC'd fields stay HMAC'd.
//
// What the log holds (probe P26, prompt 06): a held request is a `request`
// entry whose error says "request cannot be fulfilled until control group
// approval is obtained", with NO response and no accessor; an approval
// carries the HMAC of the accessor; an unwrap the HMAC of the wrapping token;
// most refusals are a bare "invalid request".
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

const MAX_EVENTS = 20_000;
const NS = `${process.env.VGOV_NAMESPACE || "governor"}/`;

// The only paths classify() turns into story events (relative to the
// namespace). Logins, lookups and capabilities checks are dropped while
// reading: the lab's own checks make many of them.
const STORY = [
  /^kv\/data\/breakglass\//,
  /^sys\/control-group\/authorize$/,
  /^sys\/wrapping\/unwrap$/,
  /^transit\/keys\/release-signing\/algorithm$/,
  /^transit\/sign\/release-signing$/,
  /^identity\/scim\/v2\/(Users|Groups)(\/|$)/,
];
const HELD = /control group approval is obtained/;
export const isHeld = (e) => e?.type === "request" && HELD.test(e.error || "");
export const isStory = (e) =>
  (e?.request?.namespace?.path || "") === NS &&
  STORY.some((re) => re.test(e.request?.path || "")) &&
  (isHeld(e) || (e.type === "response" && !HELD.test(e.error || "")));

// "vault-1=/audit/vault-1/audit.log,..." -> [{ node, file }]
export function parseLogSpec(spec) {
  return String(spec || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return { node: p.slice(0, i), file: p.slice(i + 1) };
    });
}

// Who made the call, in story names: a person (userpass), the HR system (the
// SCIM token) or a tool token.
export function who(auth) {
  if (!auth) return "unauthenticated";
  const d = String(auth.display_name || "");
  const m = /userpass-([a-z][a-z0-9-]*)$/.exec(d);
  if (m) return m[1];
  if (/governor-hr/.test(d) || auth.token_type === "scim") return "HR (SCIM)";
  if (/governor-console/.test(d)) return "console";
  if (/vgov-/.test(d)) return d.replace(/^token-/, "");
  return d || "unknown";
}

const tidy = (err) =>
  err
    ? String(err)
        .replace(/^\d+ errors? occurred:\s*/, "")
        .replace(/\*\s*/g, "")
        .replace(/A trace of the execution.*$/s, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;

// What earlier entries established, in time order: the held requests, and
// which accessor HMAC and token HMAC belong to which of them.
// shortcut: the log names no accessor for a held request, so a NEW accessor
// (or token) HMAC is given to the latest held request that has none yet. Right
// for one presenter working one request at a time; two held requests approved
// in crossed order would swap chapters. Upgrade: sys/audit-hash of each
// accessor from a root-namespace token, if the console ever gets one.
export function newContext() {
  return { held: [], byAccessor: new Map(), byToken: new Map() };
}
const claim = (ctx, map, key, slot) => {
  if (!key) return null;
  if (!map.has(key)) {
    const h = [...ctx.held].reverse().find((x) => !x[slot]);
    if (h) h[slot] = key;
    map.set(key, h?.chapter || null);
  }
  return map.get(key);
};

// One audit `response` entry -> a story event, or null. `names` maps an
// entity id to a person (SCIM paths carry the entity id in clear).
export function classify(e, ctx = newContext(), names = {}) {
  if (!isStory(e)) return null;
  const path = e.request.path;
  const err = e.error || "";
  const ok = !err;
  const base = (chapter, kind, extra = {}) => ({
    time: e.time,
    who: who(e.auth),
    chapter,
    kind,
    path,
    ok,
    error: tidy(err),
    request_id: e.request?.id || null,
    ...extra,
  });
  const egp = /egp .*evaluation resulted in denial/.test(err);
  const held = (chapter, what) => {
    ctx.held.push({ chapter });
    return { ...base(chapter, `${what} held for two keyholders`), ok: true, error: null };
  };
  if (path.startsWith("kv/data/breakglass/")) {
    if (isHeld(e)) return held("second-key", "break-glass read");
    if (egp) return base("second-key", "refused by the EGP: no valid ticket");
    return base("second-key", ok ? "break-glass value read" : "break-glass read refused");
  }
  if (path === "transit/keys/release-signing/algorithm") {
    if (isHeld(e)) return held("algorithm", "algorithm change");
    if (egp) return base("algorithm", "refused by the EGP: not the approved target");
    return base("algorithm", ok ? "algorithm changed" : "algorithm change refused");
  }
  if (path === "sys/control-group/authorize") {
    const chapter = claim(ctx, ctx.byAccessor, e.request?.data?.accessor, "acc");
    const approved = e.response?.data?.approved;
    return base(chapter, ok ? (approved === true ? "approval: enough keyholders now" : "approval recorded") : "approval refused");
  }
  if (path === "sys/wrapping/unwrap") {
    const chapter = claim(ctx, ctx.byToken, e.request?.data?.token, "tok");
    if (!chapter) return null; // not one of the story's held requests
    if (ok) return base(chapter, chapter === "algorithm" ? "held change completed" : "held read released");
    // The log keeps a bare "invalid request" for both: too few approvals, or
    // a token already used (the console shows Vault's own words).
    return base(chapter, "release refused (still held, or already used)");
  }
  if (path === "transit/sign/release-signing") return base("algorithm", ok ? "manifest signed" : "signing refused");
  const m = /^identity\/scim\/v2\/(Users|Groups)(?:\/([^/?]+))?/.exec(path);
  if (m) {
    const op = e.request?.operation;
    if (op === "read" || op === "list") return null;
    const target = m[1] === "Users" ? names[m[2]] || "a user" : "governor-keyholders";
    const kind = m[1] === "Users"
      ? op === "create" ? "HR provisioned a keyholder" : op === "patch" ? `HR changed ${target}'s account` : `HR changed ${target}`
      : op === "create" ? "HR created the keyholder group" : "HR changed the keyholder group";
    return base("left", kind);
  }
  return null;
}

// Split a chunk of log text into whole JSON lines; returns [entries, rest].
export function parseChunk(text) {
  const lines = text.split("\n");
  const rest = lines.pop();
  const out = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      // a torn or foreign line: skip it
    }
  }
  return [out, rest];
}

export function createLedger(spec = process.env.AUDIT_LOGS) {
  const files = parseLogSpec(spec).map((f) => ({
    ...f,
    offset: 0,
    rest: "",
    entries: [],
  }));

  function refresh() {
    for (const f of files) {
      let fd;
      try {
        fd = openSync(f.file, "r");
        const size = fstatSync(fd).size;
        if (size < f.offset)
          Object.assign(f, { offset: 0, rest: "", entries: [] }); // a new file
        while (f.offset < size) {
          const len = Math.min(size - f.offset, 4 * 1024 * 1024);
          const buf = Buffer.alloc(len);
          const n = readSync(fd, buf, 0, len, f.offset);
          if (n <= 0) break;
          f.offset += n;
          const [entries, rest] = parseChunk(
            f.rest + buf.subarray(0, n).toString("utf8"),
          );
          f.rest = rest;
          for (const e of entries) if (isStory(e)) f.entries.push(e);
          if (f.entries.length > MAX_EVENTS)
            f.entries.splice(0, f.entries.length - MAX_EVENTS);
        }
        f.error = null;
      } catch (e) {
        f.error = e.code || e.message;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
  }

  return {
    status() {
      refresh();
      return files.map(({ node, file, offset, error }) => ({
        node,
        file,
        bytes: offset,
        error: error || null,
      }));
    },
    // Story events since an ISO time, all nodes merged, oldest first (the
    // classification depends on order: a held request before its approvals
    // and its unwrap).
    events({ since, names = {} } = {}) {
      refresh();
      const all = [];
      // Classify everything, then cut at `since`: an unwrap after `since`
      // still needs the held request before it to know its chapter.
      for (const f of files) for (const e of f.entries) all.push([e, f.node]);
      all.sort((a, b) =>
        a[0].time < b[0].time ? -1 : a[0].time > b[0].time ? 1 : 0,
      );
      const ctx = newContext();
      const out = [];
      for (const [e, node] of all) {
        const ev = classify(e, ctx, names);
        if (ev && (!since || ev.time >= since)) out.push({ ...ev, node });
      }
      return out;
    },
  };
}
