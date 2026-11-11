// governor-api: the presenter's desk. Plain node:http, no dependencies (D15).
// Vault makes every decision; this file carries requests and returns Vault's
// answer verbatim. It holds no policy that can read the break-glass value,
// approve, sign or change a key (D14): those calls carry a person's token.
//
//   GET  /api/health                     nodes, the console token, the audit logs
//   GET  /api/story                      the story, without the break-glass value
//   POST /api/session {username,password} sign in as rowan (the requestor)
//   POST /api/session/logout             sign out, revoke the token
//   GET  /api/me                         who is signed in, as Vault sees them
//   GET  /api/rule                       the rules from Vault, each person's capabilities
//   GET  /api/chapters/:chapter          what a chapter holds now (Vault's view)
//   POST /api/chapters/:chapter/:step    one step (lib/chapters.js)
//   GET  /api/ledger?since=              the merged audit timeline
//   GET  /api/layers                     phases and gates (.build/)
import http from "node:http";
import { readFileSync } from "node:fs";
import { call, ns, activeAddr, VaultError, VAULT_NODES, nodeHealth, tokenPresent, consoleToken } from "./lib/vault.js";
import * as session from "./lib/session.js";
import * as people from "./lib/people.js";
import { said } from "./lib/said.js";
import { createRate } from "./lib/rate.js";
import { createLedger } from "./lib/ledger.js";
import { loadStory, readStage, StoryError } from "./lib/story.js";
import { scimClient, ScimError } from "./lib/scim.js";
import { verify } from "./lib/verify.js";
import { createChapters } from "./lib/chapters.js";

const PORT = Number(process.env.PORT || 3000);
const BUILD_DIR = process.env.BUILD_DIR || "/build";
const MAX_BODY = 16 * 1024;
const SCIM_TOKEN_FILE = process.env.SCIM_TOKEN_FILE || "/run/secrets/vault/scim-hr";
const story = loadStory();
const roster = JSON.parse(readFileSync(process.env.ROSTER_FILE || "/app/config/roster.json", "utf8"));
const signInRate = createRate({ max: 10, windowMs: 60_000 });
const ledger = createLedger();
const sessions = session.createSessions({ login: session.vaultLogin, revoke: session.vaultRevoke });
// The SCIM token (D13), read per call; a missing one says how to fix it.
function scimToken(file = SCIM_TOKEN_FILE) {
  let t = "";
  try {
    t = readFileSync(file, "utf8").trim();
  } catch (e) {
    throw new VaultError(503, `the SCIM token is not readable (${file}): ${e.code || e.message}; run make people`);
  }
  if (!t) throw new VaultError(503, `the SCIM token file is empty (${file}); run make people`);
  return t;
}
const scimPresent = () => {
  try {
    return scimToken().length > 0;
  } catch {
    return false;
  }
};
const scim = scimClient({ addr: activeAddr, namespace: process.env.VGOV_NAMESPACE || "governor", token: () => scimToken() });
const chapters = createChapters({ call, ns, consoleToken, people, scim, roster, story, readStage, verify, said });

class BadRequest extends StoryError {
  constructor(message) {
    super(400, message);
  }
}

// ── plumbing ─────────────────────────────────────────────────────────────────
function send(res, code, obj, headers = {}) {
  res.vaultRequestId = obj?.vault?.request_id || null;
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new BadRequest("request body too large");
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const b = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b;
  } catch {
    throw new BadRequest("the body must be a JSON object");
  }
}

const readBuild = (f) => {
  try {
    return JSON.parse(readFileSync(`${BUILD_DIR}/${f}`, "utf8"));
  } catch {
    return null;
  }
};

// Entity id -> person, for the ledger: logins the API saw, plus the roster
// (SCIM ids are entity ids).
async function names() {
  const out = Object.fromEntries(chapters.entityNames);
  try {
    for (const u of await scim.listUsers()) out[u.id] = u.userName;
  } catch {
    // the ledger still works without names
  }
  return out;
}

// ── handlers ─────────────────────────────────────────────────────────────────
const routes = {
  "GET /api/health": async () => {
    const nodes = await Promise.all(VAULT_NODES.map(nodeHealth));
    const logs = ledger.status();
    const ok = nodes.some((n) => n.reachable && !n.sealed) && tokenPresent() && scimPresent();
    return { ok, nodes, console_token: tokenPresent(), scim_token: scimPresent(), audit_logs: logs, vaultUi: process.env.VAULT_UI_URL || null };
  },

  "GET /api/story": async () => ({ story }),

  "POST /api/session": async (req, res) => {
    // Keyed on the peer address. Every console sign-in arrives from nginx,
    // so in practice this is one bucket for the console: 10 a minute.
    const t = signInRate.take(req.socket.remoteAddress || "?");
    if (!t.ok) throw new StoryError(429, `too many sign-in attempts; wait ${Math.ceil(t.retryAfterMs / 1000)} s`);
    const b = await readBody(req);
    if (typeof b.username !== "string" || typeof b.password !== "string" || !b.password || b.password.length > 256)
      throw new BadRequest("username and password, please");
    const { sid, maxAge } = await sessions.signIn(b.username.trim().toLowerCase(), b.password);
    res.setHeader("set-cookie", session.sessionCookie(sid, maxAge));
    return { signedIn: b.username.trim().toLowerCase() };
  },

  "POST /api/session/logout": async (req, res) => {
    const was = await sessions.signOut(req);
    res.setHeader("set-cookie", session.sessionCookie("", 0));
    return { signedOut: was };
  },

  "GET /api/me": async (req) => {
    const s = sessions.get(req);
    const r = await call(s.token, "GET", ns("auth/token/lookup-self"));
    return {
      user: s.user,
      vault: said(s.user, "GET", ns("auth/token/lookup-self"), r),
      entity_id: r.json?.data?.entity_id || s.entity,
      policies: r.json?.data?.policies || s.policies,
      expires_in: r.json?.data?.ttl ?? null,
    };
  },

  "GET /api/rule": async (req) => {
    const s = sessions.get(req);
    const tok = consoleToken();
    const read = async (path) => {
      const r = await call(tok, "GET", ns(path));
      return { name: path.split("/").pop(), vault: said("console", "GET", ns(path), r), policy: r.json?.data?.policy || null, paths: r.json?.data?.paths || null, enforcement_level: r.json?.data?.enforcement_level || null };
    };
    return {
      acl: await Promise.all(["sys/policies/acl/gov-requestor", "sys/policies/acl/gov-keyholder"].map(read)),
      egp: await Promise.all(["sys/policies/egp/gov-breakglass-ticket", "sys/policies/egp/gov-algorithm-target"].map(read)),
      capabilities: await chapters.capabilities(s),
      terraform: readBuild("terraform/vault-platform.json"),
    };
  },

  "GET /api/ledger": async (req, res, url) => {
    sessions.get(req);
    const since = url.searchParams.get("since") || null;
    if (since && Number.isNaN(Date.parse(since))) throw new BadRequest("since: an ISO time");
    return { events: ledger.events({ since, names: await names() }), logs: ledger.status() };
  },

  "GET /api/layers": async () => ({ layers: readBuild("layers.json"), convergence: readBuild("convergence.json") }),
};

// /api/chapters/:chapter[/:step]
async function chapterRoute(req, url) {
  const m = /^\/api\/chapters\/([a-z-]+)(?:\/([a-z-]+))?$/.exec(url.pathname);
  if (!m) return null;
  const s = sessions.get(req);
  if (req.method === "GET" && !m[2]) return chapters.state(s, m[1]);
  if (req.method === "POST" && m[2]) return chapters.run(s, m[1], m[2], await readBody(req));
  throw new StoryError(405, "method not allowed");
}

export const server = http.createServer(async (req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  const url = new URL(req.url, "http://api");
  // One JSON line per request; vault_request_id joins it to the audit log.
  // Polls that went fine stay quiet. Bodies (passwords) are never logged.
  const t0 = Date.now();
  res.on("finish", () => {
    if (req.method === "GET" && res.statusCode < 400 && /^\/api\/(health|ledger|layers|chapters\/[a-z-]+)$/.test(url.pathname)) return;
    console.log(JSON.stringify({ at: new Date().toISOString(), method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - t0, vault_request_id: res.vaultRequestId || null }));
  });
  if (session.crossSiteWrite(req))
    return send(res, 403, { ok: false, error: "refused: this request came from another site" });
  try {
    let out = await chapterRoute(req, url);
    if (out === null) {
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) {
        const known = Object.keys(routes).some((k) => k.endsWith(` ${url.pathname}`));
        return send(res, known ? 405 : 404, { ok: false, error: known ? "method not allowed" : "not found" });
      }
      out = await handler(req, res, url);
    }
    return send(res, url.pathname === "/api/health" && !out.ok ? 503 : 200, { ok: true, ...out });
  } catch (e) {
    if (e instanceof session.Unauthenticated) return send(res, 401, { ok: false, error: e.message });
    if (e instanceof session.Refused) return send(res, e.status, { ok: false, error: e.message });
    if (e instanceof StoryError) return send(res, e.status, { ok: false, error: e.message });
    if (e instanceof ScimError) {
      console.error(`[governor-api] ${req.method} ${url.pathname}: SCIM ${e.message}`);
      return send(res, 502, { ok: false, error: `the HR system (SCIM): ${e.message}` });
    }
    if (e instanceof VaultError) return send(res, 502, { ok: false, error: e.message });
    console.error(`[governor-api] ${req.method} ${url.pathname}:`, e?.stack || e);
    return send(res, 500, { ok: false, error: "internal error" });
  }
});

// The console token is periodic (24h): renew it while the API runs (D14).
async function renewConsole() {
  try {
    const r = await call(consoleToken(), "POST", ns("auth/token/renew-self"));
    if (!r.ok) console.error(`[governor-api] console token renew: HTTP ${r.status} ${r.errors[0] || ""}`);
  } catch (e) {
    console.error(`[governor-api] console token renew: ${e.message}`);
  }
}

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => console.log(`[governor-api] listening on :${PORT}, Vault ${VAULT_NODES.join(" ")}`));
  renewConsole();
  setInterval(renewConsole, 3_600_000).unref();
  // PID 1 in the container: without a handler node ignores SIGTERM and
  // podman kills it after the stop timeout (exit 137).
  for (const sig of ["SIGTERM", "SIGINT"])
    process.on(sig, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3_000).unref();
    });
}
