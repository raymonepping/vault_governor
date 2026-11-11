// lib/chapters.js: the three chapters as steps (D15). Every step makes real
// Vault calls with the token of the person who acts and returns Vault's
// answer verbatim ("Vault said", lib/said.js). The state a chapter keeps (a
// held request's accessor and wrapping token, the leaver's old token, the
// signatures) lives in the presenter's session on the server; the browser
// sees accessors and states, never a token. Whether anything is allowed is
// Vault's decision: no step checks a ticket, an approval count or a group.
import { reconcile } from "./scim.js";
import { StoryError } from "./story.js";

const TICKET_SHAPE = /^[A-Za-z0-9-]{1,32}$/; // shape only: the EGP decides
const ALGO_SHAPE = /^[a-z0-9-]{2,24}$/;
const SET_SHAPE = /^[a-z0-9-]{1,16}$/;
export const CHAPTERS = ["second-key", "algorithm", "left"];
const b64 = (s) => Buffer.from(s).toString("base64");

// deps: { call, ns, consoleToken, people: { as, login, revoke, isStagehand },
//         scim (scimClient), roster, story, readStage, verify, said }
export function createChapters(deps) {
  const { call, ns, consoleToken, people, scim, roster, story, readStage, verify, said } = deps;
  const entityNames = new Map(); // entity id -> user, learned from logins
  const learn = (r, user) => r?.json?.auth?.entity_id && entityNames.set(r.json.auth.entity_id, user);
  const leaver = story.chapters.find((c) => c.id === "left")?.leaver || "mara";
  const keyholderGroup = story.keyholder_group;
  const breakglass = ns(`kv/data/${story.breakglass.path}`);
  const algorithmPath = ns("transit/keys/release-signing/algorithm");

  async function asRowan(s, method, path, body) {
    const r = await call(s.token, method, path, body === undefined ? {} : { body });
    return { r, vault: said(s.user, method, path, r) };
  }
  // A stage hand's one call; a refused login is the answer.
  async function asPerson(user, method, path, body) {
    if (!people.isStagehand(user)) throw new StoryError(400, `not someone the presenter plays: ${user}`);
    const { login, result, entity } = await people.as(user, (tok) => call(tok, method, path, body === undefined ? {} : { body }));
    if (entity) entityNames.set(entity, user);
    if (!result) return { r: login, vault: said(user, "POST", ns(`auth/userpass/login/${user}`), login) };
    return { r: result, vault: said(user, method, path, result) };
  }
  const pendingOf = (s, ch) => {
    const p = s.state[ch];
    if (!p?.accessor) throw new StoryError(409, "there is no held request in this chapter yet: ask first");
    return p;
  };
  const hold = (s, ch, r, extra = {}) => {
    const wi = r.json?.wrap_info;
    if (r.ok && wi?.accessor) s.state[ch] = { ...(s.state[ch] || {}), accessor: wi.accessor, token: wi.token, ttl: wi.ttl, at: new Date().toISOString(), ...extra };
    return Boolean(wi?.accessor);
  };

  // Vault's own view of a held request (sys/control-group/request), with the
  // approvers named as the story knows them.
  async function status(s, ch, accessor = pendingOf(s, ch).accessor) {
    const path = ns("sys/control-group/request");
    const r = await call(consoleToken(), "POST", path, { body: { accessor } });
    const d = r.json?.data || {};
    // Membership of the keyholder group now, as Vault holds it: a fact shown
    // next to each approver. Whether the request is approved is Vault's word.
    const members = r.ok ? (await groupView()).members : [];
    return {
      vault: said("console", "POST", path, r),
      request: r.ok
        ? {
            accessor,
            approved: Boolean(d.approved),
            path: d.request_path || null,
            by: (d.authorizations || []).map((a) => ({ entity_id: a.entity_id, name: entityNames.get(a.entity_id) || a.entity_name, member: members.includes(a.entity_id) })),
          }
        : null,
    };
  }

  const approve = async (s, ch, { as }) => {
    const { accessor } = pendingOf(s, ch);
    const out = await asPerson(as, "POST", ns("sys/control-group/authorize"), { accessor });
    // The approval's own answer stays "Vault said"; the request's state comes along.
    const { request } = await status(s, ch);
    return { actor: as, ...out, request };
  };

  const open = async (s, ch) => {
    const p = pendingOf(s, ch);
    const out = await asRowan(s, "POST", ns("sys/wrapping/unwrap"), { token: p.token });
    if (out.r.ok) p.opened = (p.opened || 0) + 1;
    return { actor: s.user, ...out };
  };

  const common = { approve, status: async (s, ch) => ({ actor: "console", ...(await status(s, ch)) }), open };

  // ── Chapter I: The Second Key (input/05.md) ─────────────────────────────────
  const secondKey = {
    async read(s, { ticket } = {}) {
      if (ticket !== undefined && ticket !== "" && !TICKET_SHAPE.test(String(ticket))) throw new StoryError(400, "ticket: letters, digits and dashes, at most 32");
      const path = ticket ? `${breakglass}?ticket=${encodeURIComponent(ticket)}` : breakglass;
      const out = await asRowan(s, "GET", path);
      const held = hold(s, "second-key", out.r, { ticket: ticket || null });
      return { actor: s.user, held, ...out };
    },
  };

  // ── Chapter II: The Algorithm's Second Key (input/06.md) ───────────────────
  async function keyView() {
    const path = ns("transit/keys/release-signing");
    const r = await call(consoleToken(), "GET", path);
    const d = r.json?.data || {};
    const versions = Object.entries(d.keys || {}).map(([v, k]) => ({ version: Number(v), name: k.name || null, created: k.creation_time || null }));
    return {
      vault: said("console", "GET", path, r),
      key: r.ok ? { type: d.type, latest_version: d.latest_version, latest_version_type: d.latest_version_type || d.type, min_decryption_version: d.min_decryption_version, versions } : null,
    };
  }
  async function publicKeyOf(version) {
    const path = ns(`transit/export/public-key/release-signing/${version}`);
    const r = await call(consoleToken(), "GET", path);
    return { r, key: r.json?.data?.keys?.[String(version)] || null };
  }
  const algorithm = {
    key: async () => ({ actor: "console", ...(await keyView()) }),
    async baseline(s) {
      const { manifest, baseline } = readStage();
      const out = await asRowan(s, "POST", ns("transit/verify/release-signing"), { input: b64(manifest), signature: baseline.signature });
      s.state.signatures = { ...(s.state.signatures || {}), 1: baseline.signature };
      return { actor: s.user, manifest: JSON.parse(manifest), baseline: { version: baseline.key_version, type: baseline.type, signature: baseline.signature.slice(0, 20) + "...", signed_at: baseline.signed_at }, ...out };
    },
    async request(s, { type, parameter_set } = {}) {
      if (!ALGO_SHAPE.test(String(type || ""))) throw new StoryError(400, "type: an algorithm name such as ml-dsa");
      if (parameter_set !== undefined && parameter_set !== "" && !SET_SHAPE.test(String(parameter_set))) throw new StoryError(400, "parameter_set: such as 65");
      const body = parameter_set ? { type, parameter_set: String(parameter_set) } : { type };
      const out = await asRowan(s, "POST", algorithmPath, body);
      const held = hold(s, "algorithm", out.r, { target: body });
      return { actor: s.user, held, ...out, ...(await keyView().then((k) => ({ key: k.key }))) };
    },
    async sign(s) {
      const { manifest } = readStage();
      const out = await asRowan(s, "POST", ns("transit/sign/release-signing"), { input: b64(manifest) });
      const sig = out.r.json?.data?.signature;
      const version = Number(/^vault:v(\d+):/.exec(sig || "")?.[1]);
      if (version) s.state.signatures = { ...(s.state.signatures || {}), [version]: sig };
      return { actor: s.user, version: version || null, ...out };
    },
    // Both sides of the migration: Vault's verify and the lab's verifier.
    async verify(s) {
      const { manifest, baseline } = readStage();
      const sigs = { 1: baseline.signature, ...(s.state.signatures || {}) };
      const results = [];
      for (const [v, sig] of Object.entries(sigs)) {
        const vault = await asRowan(s, "POST", ns("transit/verify/release-signing"), { input: b64(manifest), signature: sig });
        const pub = await publicKeyOf(v);
        results.push({
          version: Number(v),
          vault: vault.vault,
          vault_valid: vault.r.json?.data?.valid ?? false,
          lab: pub.key ? verify(manifest, sig, pub.key) : { version: Number(v), error: pub.r.errors[0] || "no public key for this version" },
        });
      }
      return { actor: s.user, results };
    },
  };

  // ── Chapter III: The Keyholder Who Left (input/07.md) ───────────────────────
  async function groupView() {
    const path = ns(`identity/group/name/${keyholderGroup}`);
    const r = await call(consoleToken(), "GET", path);
    return { vault: said("console", "GET", path, r), members: r.json?.data?.member_entity_ids || [] };
  }
  const left = {
    async roster() {
      const users = await scim.listUsers();
      const g = await groupView();
      return {
        actor: "HR (SCIM)",
        vault: g.vault,
        roster: users.map((u) => ({ user: u.userName, id: u.id, active: u.active !== false, member: g.members.includes(u.id) })),
      };
    },
    async request(s) {
      const path = `${breakglass}?ticket=${encodeURIComponent(story.ticket_example)}`;
      const out = await asRowan(s, "GET", path);
      const held = hold(s, "left", out.r, { ticket: story.ticket_example });
      return { actor: s.user, held, ...out };
    },
    // The leaver's token from before she leaves, kept server side for the check.
    async "leaver-login"(s) {
      const r = await people.login(leaver);
      learn(r, leaver);
      if (r.ok) {
        if (s.state.leaverToken) await people.revoke(s.state.leaverToken);
        s.state.leaverToken = r.json.auth.client_token;
      }
      return { actor: leaver, vault: said(leaver, "POST", ns(`auth/userpass/login/${leaver}`), r) };
    },
    async offboard(s, { mode } = {}) {
      if (!["group", "inactive"].includes(mode)) throw new StoryError(400, "mode: group (remove from governor-keyholders) or inactive (active=false)");
      const u = await scim.findUser(leaver);
      if (!u) throw new StoryError(409, `${leaver} is not on the HR roster in Vault; run make roster`);
      if (mode === "group") {
        const g = await scim.findGroup(keyholderGroup);
        await scim.removeMember(g.id, u.id, leaver);
      } else await scim.setActive(u.id, false, leaver);
      s.state.offboarded = mode;
      const g = await groupView();
      const after = await scim.findUser(leaver);
      return { actor: "HR (SCIM)", mode, vault: g.vault, leaver: { user: leaver, active: after?.active !== false, member: g.members.includes(u.id) } };
    },
    // What the leaver can still do, each answer measured (probe P21, P24).
    async "leaver-check"(s) {
      const old = s.state.leaverToken;
      if (!old) throw new StoryError(409, `log ${leaver} in before she leaves (step leaver-login)`);
      const checks = [];
      const look = await call(old, "GET", ns("auth/token/lookup-self"));
      checks.push({ check: "her token from before", vault: said(leaver, "GET", ns("auth/token/lookup-self"), look), works: look.ok });
      const fresh = await people.login(leaver);
      checks.push({ check: "a new login", vault: said(leaver, "POST", ns(`auth/userpass/login/${leaver}`), fresh), works: fresh.ok });
      if (fresh.ok) await people.revoke(fresh.json.auth.client_token);
      const pending = s.state.left?.accessor;
      if (pending) {
        const a = await call(old, "POST", ns("sys/control-group/authorize"), { body: { accessor: pending } });
        const st = await status(s, "left", pending);
        checks.push({ check: "her approval on the waiting request", vault: said(leaver, "POST", ns("sys/control-group/authorize"), a), works: a.ok, request: st.request });
      }
      const fresh2 = await call(s.token, "GET", `${breakglass}?ticket=${encodeURIComponent(story.ticket_example)}`);
      const acc = fresh2.json?.wrap_info?.accessor;
      if (acc) {
        const a = await call(old, "POST", ns("sys/control-group/authorize"), { body: { accessor: acc } });
        const st = await status(s, "left", acc);
        checks.push({ check: "her approval on a new request", vault: said(leaver, "POST", ns("sys/control-group/authorize"), a), works: a.ok, request: st.request });
      }
      return { actor: leaver, mode: s.state.offboarded || null, checks };
    },
    // The HR roster again: Vault converges back to config/roster.json.
    async reconcile(s) {
      const r = await reconcile(scim, roster);
      if (s.state.leaverToken) {
        await people.revoke(s.state.leaverToken);
        delete s.state.leaverToken;
      }
      delete s.state.offboarded;
      return { actor: "HR (SCIM)", ...r };
    },
  };

  const steps = { "second-key": secondKey, algorithm, left };

  return {
    entityNames,
    async run(s, chapter, step, body = {}) {
      if (!CHAPTERS.includes(chapter)) throw new StoryError(404, `no chapter ${chapter}`);
      const fn = steps[chapter][step] || (["approve", "status", "open"].includes(step) && ((ss, b) => common[step](ss, chapter, b)));
      if (!fn) throw new StoryError(404, `no step ${step} in ${chapter}`);
      // `r` is Vault's raw answer (with wrapping tokens): it stays here. The
      // browser gets "Vault said" (lib/said.js), which keeps only accessors.
      const { r: _raw, ...out } = await fn(s, body);
      return { chapter, step, ...out };
    },
    // What a chapter holds right now, from Vault (for a page reload).
    async state(s, chapter) {
      if (!CHAPTERS.includes(chapter)) throw new StoryError(404, `no chapter ${chapter}`);
      const p = s.state[chapter];
      const out = { chapter, held: Boolean(p?.accessor), opened: p?.opened || 0 };
      if (p?.accessor) Object.assign(out, await status(s, chapter));
      if (chapter === "algorithm") out.key = (await keyView()).key;
      if (chapter === "left") out.offboarded = s.state.offboarded || null;
      return out;
    },
    // Each person's capabilities on the protected paths (The Rule).
    async capabilities(s) {
      const paths = [story.chapters.find((c) => c.id === "second-key").path, "transit/keys/release-signing/algorithm", "sys/control-group/authorize"];
      const ask = (tok) => call(tok, "POST", ns("sys/capabilities-self"), { body: { paths } });
      const rows = [];
      for (const p of story.people) {
        let r;
        if (p.user === s.user) r = await ask(s.token);
        else if (people.isStagehand(p.user)) r = (await people.as(p.user, ask)).result;
        rows.push({ user: p.user, role: p.role, caps: r?.ok ? Object.fromEntries(paths.map((x) => [x, (r.json.data || r.json)[x] || []])) : null, error: r && !r.ok ? r.errors[0] : null });
      }
      return { paths, rows };
    },
  };
}
