// The chapter steps against a fake Vault: whose token makes each call, what
// the browser may see (never a token), and that the API decides nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createChapters } from "../lib/chapters.js";
import { publicStory, StoryError } from "../lib/story.js";
import { said } from "../lib/said.js";

const story = publicStory(JSON.parse(readFileSync(new URL("../../config/story.json", import.meta.url), "utf8")));
const ns = (p) => `governor/${p}`;
const res = (status, json) => ({ ok: status < 400, status, json, errors: json?.errors || [], requestId: "req", node: "vault-1" });

function setup() {
  const calls = [];
  const approvals = [];
  async function call(token, method, path, opts = {}) {
    calls.push({ token, method, path, body: opts.body });
    if (path.startsWith(ns("kv/data/breakglass/lock-gates"))) {
      if (!path.includes("?ticket=")) return res(403, { errors: ["egp standard policy evaluation resulted in denial"] });
      return res(200, { wrap_info: { token: "WRAP-SECRET", accessor: "acc-1", ttl: 900, creation_path: "kv/data/breakglass/lock-gates" } });
    }
    if (path === ns("sys/control-group/authorize")) {
      approvals.push(token);
      return res(200, { data: { approved: approvals.length >= 2 } });
    }
    if (path === ns("sys/control-group/request"))
      return res(200, { data: { approved: approvals.length >= 2, request_path: "kv/data/breakglass/lock-gates", authorizations: approvals.map((t) => ({ entity_id: `e-${t}`, entity_name: t })) } });
    if (path === ns("sys/wrapping/unwrap")) return res(200, { data: { data: { recovery_code: "REVEALED" } } });
    if (path === ns("transit/keys/release-signing")) return res(200, { data: { type: "ecdsa-p256", latest_version: 1, keys: { 1: { name: "P-256" } } } });
    if (path === ns("transit/keys/release-signing/algorithm")) return res(200, { wrap_info: { token: "WRAP-2", accessor: "acc-2", ttl: 900 } });
    return res(404, { errors: ["unexpected"] });
  }
  const people = {
    isStagehand: (u) => ["ines", "kofi", "mara", "jonas"].includes(u),
    async as(user, fn) {
      return { login: res(200, { auth: { client_token: `tok-${user}`, entity_id: `e-tok-${user}` } }), result: await fn(`tok-${user}`), entity: `e-tok-${user}` };
    },
    login: async (user) => res(200, { auth: { client_token: `tok-${user}`, entity_id: `e-tok-${user}` } }),
    revoke: async () => {},
  };
  const ch = createChapters({ call, ns, consoleToken: () => "tok-console", people, scim: {}, roster: {}, story, readStage: () => ({}), verify: () => ({}), said });
  const s = { user: "rowan", token: "tok-rowan", state: {} };
  return { ch, s, calls };
}

test("chapter I end to end: refused, held, approved twice, released", async () => {
  const { ch, s, calls } = setup();
  const refused = await ch.run(s, "second-key", "read");
  assert.equal(refused.vault.status, 403);
  const held = await ch.run(s, "second-key", "read", { ticket: "HAR-0417" });
  assert.equal(held.held, true);
  assert.equal(calls.at(-1).token, "tok-rowan");
  const a1 = await ch.run(s, "second-key", "approve", { as: "ines" });
  assert.equal(a1.actor, "ines");
  assert.equal(a1.vault.path, ns("sys/control-group/authorize"), "the approval's own answer, not the status lookup");
  assert.equal(a1.request.by[0].name, "ines");
  assert.equal(calls.find((c) => c.path === ns("sys/control-group/authorize")).token, "tok-ines");
  assert.equal(a1.request.approved, false);
  assert.equal(calls.find((c) => c.path === ns("sys/control-group/request")).token, "tok-console");
  const a2 = await ch.run(s, "second-key", "approve", { as: "kofi" });
  assert.equal(a2.request.approved, true);
  const out = await ch.run(s, "second-key", "open");
  assert.equal(out.vault.data.data.recovery_code, "REVEALED");
  assert.equal(calls.at(-1).body.token, "WRAP-SECRET");
});

test("playing a chapter again starts a fresh request: nothing opened yet", async () => {
  const { ch, s } = setup();
  await ch.run(s, "second-key", "read", { ticket: "HAR-0417" });
  await ch.run(s, "second-key", "approve", { as: "ines" });
  await ch.run(s, "second-key", "approve", { as: "kofi" });
  await ch.run(s, "second-key", "open");
  assert.equal((await ch.state(s, "second-key")).opened, 1);
  await ch.run(s, "second-key", "read", { ticket: "HAR-0417" });
  assert.equal((await ch.state(s, "second-key")).opened, 0);
});

test("no step ever hands the browser a wrapping token", async () => {
  const { ch, s } = setup();
  const outs = [await ch.run(s, "second-key", "read", { ticket: "HAR-0417" }), await ch.run(s, "second-key", "approve", { as: "ines" }), await ch.state(s, "second-key")];
  for (const o of outs) assert.ok(!JSON.stringify(o).includes("WRAP-SECRET"));
});

test("input is checked for shape only; Vault decides the rest", async () => {
  const { ch, s, calls } = setup();
  await assert.rejects(ch.run(s, "second-key", "read", { ticket: "x&admin=1" }), (e) => e instanceof StoryError && e.status === 400);
  await assert.rejects(ch.run(s, "algorithm", "request", { type: "../../sys" }), (e) => e.status === 400);
  assert.equal(calls.length, 0);
  const wrong = await ch.run(s, "second-key", "read", { ticket: "NOPE-1" });
  assert.equal(calls.at(-1).path, ns("kv/data/breakglass/lock-gates?ticket=NOPE-1"));
  assert.equal(wrong.held, true); // the fake Vault accepts any ticket: the API did not judge it
});

test("approve before a request, or as someone the presenter does not play: refused", async () => {
  const { ch, s } = setup();
  await assert.rejects(ch.run(s, "second-key", "approve", { as: "ines" }), (e) => e.status === 409);
  await ch.run(s, "second-key", "read", { ticket: "HAR-0417" });
  await assert.rejects(ch.run(s, "second-key", "approve", { as: "rowan" }), (e) => e.status === 400);
});

test("the algorithm change is held and the key shown from the console's read", async () => {
  const { ch, s, calls } = setup();
  const r = await ch.run(s, "algorithm", "request", { type: "ml-dsa", parameter_set: "65" });
  assert.equal(r.held, true);
  assert.deepEqual(calls.find((c) => c.path.endsWith("/algorithm")).body, { type: "ml-dsa", parameter_set: "65" });
  assert.equal(r.key.latest_version, 1);
});

test("unknown chapters and steps are 404; the leaver check needs her old token", async () => {
  const { ch, s } = setup();
  await assert.rejects(ch.run(s, "nope", "read"), (e) => e.status === 404);
  await assert.rejects(ch.run(s, "left", "drop-tables"), (e) => e.status === 404);
  await assert.rejects(ch.run(s, "left", "leaver-check"), (e) => e.status === 409);
});
