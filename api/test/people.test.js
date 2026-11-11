// The stage hand keeps a person's token for its TTL: Vault forgets an
// approval when the approver's token is revoked (probe P27), so one login
// per action (and a revoke after it) would undo every approval.
import { test } from "node:test";
import assert from "node:assert/strict";
import { as } from "../lib/people.js";

const fakeLogin = (counter, lease = 3600) => async (user) => {
  counter.n++;
  return { ok: true, status: 200, json: { auth: { client_token: `tok-${user}-${counter.n}`, entity_id: `e-${user}`, lease_duration: lease } } };
};

test("a second action reuses the token: one login, the same token", async () => {
  const c = { n: 0 };
  const seen = [];
  const first = await as("kofi", async (t) => seen.push(t), 1_000_000, fakeLogin(c));
  const second = await as("kofi", async (t) => seen.push(t), 1_500_000, fakeLogin(c));
  assert.equal(c.n, 1);
  assert.equal(seen[0], seen[1]);
  assert.ok(first.login && !second.login, "only the first call logged in");
  assert.equal(second.entity, "e-kofi");
});

test("a token within a minute of its expiry is replaced by a new login", async () => {
  const c = { n: 0 };
  const seen = [];
  await as("mara", async (t) => seen.push(t), 0, fakeLogin(c, 120));
  await as("mara", async (t) => seen.push(t), 61_000, fakeLogin(c, 120));
  assert.equal(c.n, 2);
  assert.notEqual(seen[0], seen[1]);
});

test("a refused login is the answer, and nothing is kept", async () => {
  const refused = async () => ({ ok: false, status: 403, errors: ["permission denied"] });
  const r = await as("jonas", async () => "never", 0, refused);
  assert.equal(r.result, null);
  assert.equal(r.login.status, 403);
  const c = { n: 0 };
  await as("jonas", async () => null, 1, fakeLogin(c));
  assert.equal(c.n, 1, "the refusal was not cached");
});
