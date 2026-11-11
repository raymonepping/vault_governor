// lib/scim.js: the SCIM client governor-hr (D13), shared by scripts/roster.js
// (make roster) and the API (chapter III). It speaks Vault's SCIM v2 API in
// namespace governor with the SCIM token, and nothing else.
//
// What Vault supports (docs/capabilities.md, P3 to P25): POST/GET Users and
// Groups, user PATCH with one `replace` of `active`, group PATCH that adds or
// removes members (`members[value eq "<id>"]` for a removal), filters
// `userName eq` and `displayName eq`, no bulk. A client sees only what it
// created. Every refusal is thrown as ScimError with Vault's answer verbatim.

const CORE_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const CORE_GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_OP = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export class ScimError extends Error {
  constructor(status, detail, what) {
    super(`${what}: HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
    this.detail = detail;
  }
}

// client({ addr, namespace, token, fetch }) -> the four calls the story needs.
// `token` is a function, so a re-minted token file is read on every call.
export function scimClient({ addr, namespace, token, fetch: f = fetch }) {
  const base = `${addr.replace(/\/$/, "")}/v1/${namespace}/identity/scim/v2`;
  async function call(method, path, body, what) {
    const res = await f(`${base}/${path}`, {
      method,
      headers: { "X-Vault-Token": token(), "Content-Type": "application/scim+json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) throw new ScimError(res.status, json?.detail ?? json?.errors?.[0] ?? text.slice(0, 200), what);
    return json;
  }
  const filter = (attr, value) => `filter=${encodeURIComponent(`${attr} eq "${value}"`)}`;
  return {
    async findUser(userName) {
      const r = await call("GET", `Users?${filter("userName", userName)}`, undefined, `find user ${userName}`);
      return r?.Resources?.[0] ?? null;
    },
    async listUsers() {
      const r = await call("GET", "Users", undefined, "list users");
      return r?.Resources ?? [];
    },
    createUser: (userName, active) =>
      call("POST", "Users", { schemas: [CORE_USER], userName, active }, `create user ${userName}`),
    setActive: (id, active, userName = id) =>
      call("PATCH", `Users/${id}`, { schemas: [PATCH_OP], Operations: [{ op: "replace", path: "active", value: active }] }, `set ${userName} active=${active}`),
    async findGroup(displayName) {
      const r = await call("GET", `Groups?${filter("displayName", displayName)}`, undefined, `find group ${displayName}`);
      return r?.Resources?.[0] ?? null;
    },
    createGroup: (displayName, ids) =>
      call("POST", "Groups", { schemas: [CORE_GROUP], displayName, members: ids.map((value) => ({ value })) }, `create group ${displayName}`),
    addMember: (gid, id, label = id) =>
      call("PATCH", `Groups/${gid}`, { schemas: [PATCH_OP], Operations: [{ op: "add", path: "members", value: [{ value: id }] }] }, `add ${label}`),
    removeMember: (gid, id, label = id) =>
      call("PATCH", `Groups/${gid}`, { schemas: [PATCH_OP], Operations: [{ op: "remove", path: `members[value eq "${id}"]` }] }, `remove ${label}`),
  };
}

// reconcile(client, roster) -> { changed, changes }: bring Vault to the HR
// roster (config/roster.json). Idempotent: a converged roster gives changed=0.
// A user the client owns but the roster no longer lists is deactivated, not
// deleted (the audit trail keeps its entity).
export async function reconcile(c, roster) {
  const changes = [];
  const ids = new Map(); // userName -> SCIM id, for the roster's users
  const names = new Map(); // SCIM id -> userName, for every user the client owns
  const wanted = new Set(roster.users.map((u) => u.userName));
  for (const u of roster.users) {
    let found = await c.findUser(u.userName);
    if (!found) {
      found = await c.createUser(u.userName, u.active);
      changes.push(`create user ${u.userName}${u.active ? "" : " (inactive)"}`);
    } else if (found.active !== u.active) {
      await c.setActive(found.id, u.active, u.userName);
      changes.push(`${u.active ? "activate" : "deactivate"} ${u.userName}`);
    }
    ids.set(u.userName, found.id);
    names.set(found.id, u.userName);
  }
  for (const owned of await c.listUsers()) {
    names.set(owned.id, owned.userName);
    if (!wanted.has(owned.userName) && owned.active !== false) {
      await c.setActive(owned.id, false, owned.userName);
      changes.push(`deactivate ${owned.userName} (not on the roster)`);
    }
  }
  for (const g of roster.groups) {
    const want = g.members.map((m) => ids.get(m));
    const group = await c.findGroup(g.displayName);
    if (!group) {
      await c.createGroup(g.displayName, want);
      changes.push(`create group ${g.displayName} (${g.members.join(", ")})`);
      continue;
    }
    const have = new Set((group.members ?? []).map((m) => m.value));
    const name = (id) => names.get(id) ?? id;
    for (const id of want) if (!have.has(id)) { await c.addMember(group.id, id, name(id)); changes.push(`add ${name(id)} to ${g.displayName}`); }
    for (const id of have) if (!want.includes(id)) { await c.removeMember(group.id, id, name(id)); changes.push(`remove ${name(id)} from ${g.displayName}`); }
  }
  return { changed: changes.length, changes };
}
