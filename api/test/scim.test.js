// The SCIM client against a fake Vault SCIM server that keeps Vault's rules:
// one `replace` of `active` on users, add/remove members on groups, filters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, scimClient, ScimError } from "../lib/scim.js";

function fakeVault() {
  const users = new Map();
  const groups = new Map();
  let n = 0;
  const calls = [];
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  async function f(url, { method, headers, body }) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v1\/governor\/identity\/scim\/v2\//, "");
    calls.push(`${method} ${path}${u.search}`);
    assert.equal(headers["Content-Type"], "application/scim+json");
    if (headers["X-Vault-Token"] !== "scim-token") return json(403, { errors: ["permission denied"] });
    const data = body ? JSON.parse(body) : null;
    const filter = u.searchParams.get("filter");
    const eq = filter && /^(\w+) eq "(.*)"$/.exec(filter);
    const [kind, id] = path.split("/");
    const store = kind.startsWith("Users") ? users : groups;
    if (method === "GET" && !id) {
      const all = [...store.values()].filter((r) => !eq || r[eq[1]] === eq[2]);
      return json(200, { Resources: all, totalResults: all.length });
    }
    if (method === "POST") {
      const r = { id: `id-${++n}`, ...data };
      if (kind === "Users" && r.active === undefined) r.active = true;
      store.set(r.id, r);
      return json(201, r);
    }
    if (method === "PATCH") {
      const r = store.get(id);
      if (!r) return json(404, { detail: "not found" });
      const [op] = data.Operations;
      if (kind === "Users") {
        if (op.op !== "replace" || op.path !== "active") return json(400, { detail: "unsupported" });
        r.active = op.value;
      } else if (op.op === "add") r.members = [...(r.members ?? []), ...op.value];
      else if (op.op === "remove") {
        const m = /members\[value eq "(.*)"\]/.exec(op.path);
        r.members = r.members.filter((x) => x.value !== m[1]);
      }
      return json(204);
    }
    return json(405, { detail: "unexpected" });
  }
  return { f, users, groups, calls };
}

const roster = {
  users: [
    { userName: "ines", active: true },
    { userName: "kofi", active: true },
    { userName: "mara", active: true },
  ],
  groups: [{ displayName: "governor-keyholders", members: ["ines", "kofi", "mara"] }],
};
const client = (v, token = "scim-token") => scimClient({ addr: "https://vault:8200", namespace: "governor", token: () => token, fetch: v.f });

test("first run creates three users and the group; the second changes nothing", async () => {
  const v = fakeVault();
  const first = await reconcile(client(v), roster);
  assert.equal(first.changed, 4);
  assert.equal(v.users.size, 3);
  assert.equal([...v.groups.values()][0].members.length, 3);
  const second = await reconcile(client(v), roster);
  assert.deepEqual(second, { changed: 0, changes: [] });
});

test("a keyholder removed in Vault is added back; a deactivated one is reactivated", async () => {
  const v = fakeVault();
  const c = client(v);
  await reconcile(c, roster);
  const g = [...v.groups.values()][0];
  const mara = await c.findUser("mara");
  await c.removeMember(g.id, mara.id);
  await c.setActive(mara.id, false);
  const r = await reconcile(c, roster);
  assert.deepEqual(r.changes.sort(), ["activate mara", "add mara to governor-keyholders"]);
});

test("the roster drops mara: she is deactivated and leaves the group, never deleted", async () => {
  const v = fakeVault();
  await reconcile(client(v), roster);
  const leaver = { users: roster.users.slice(0, 2), groups: [{ displayName: "governor-keyholders", members: ["ines", "kofi"] }] };
  const r = await reconcile(client(v), leaver);
  assert.deepEqual(r.changes.sort(), ["deactivate mara (not on the roster)", "remove mara from governor-keyholders"]);
  assert.equal(v.users.size, 3);
});

test("a refusal carries Vault's answer and the action", async () => {
  const v = fakeVault();
  await assert.rejects(reconcile(client(v, "wrong"), roster), (e) => e instanceof ScimError && e.status === 403 && /find user ines: HTTP 403: permission denied/.test(e.message));
});

test("the filter is URL-encoded userName eq", async () => {
  const v = fakeVault();
  await client(v).findUser("ines");
  assert.match(v.calls[0], /^GET Users\?filter=userName%20eq%20%22ines%22$/);
});
