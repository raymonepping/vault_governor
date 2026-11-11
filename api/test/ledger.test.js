import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, createLedger, newContext, who, isStory } from "../lib/ledger.js";

const ns = { id: "x1", path: "governor/" };
const auth = (user) => ({ display_name: `userpass-${user}`, entity_id: `e-${user}` });
const HELD = "1 error occurred:\n\t* request cannot be fulfilled until control group approval is obtained, initiating approval process by creating token to be approved\n\n";
const heldEntry = (path, extra = {}) => ({ ...entry(path, extra), type: "request", error: HELD });
const entry = (path, extra = {}) => ({ type: extra.type || "response", time: extra.time || "2026-11-11T20:00:00Z", auth: auth(extra.as || "rowan"), request: { id: "r", path, namespace: ns, operation: extra.op || "update", data: extra.data }, response: extra.response, error: extra.error });

test("who: people by userpass, the HR system, tools", () => {
  assert.equal(who({ display_name: "userpass-ines" }), "ines");
  assert.equal(who({ display_name: "token-governor-hr", token_type: "scim" }), "HR (SCIM)");
  assert.equal(who({ display_name: "token-vgov-ansible-platform" }), "vgov-ansible-platform");
});

test("two held requests: each new accessor goes to the latest one without one", () => {
  const ctx = newContext();
  classify(heldEntry("kv/data/breakglass/lock-gates"), ctx);
  const a = classify(entry("sys/control-group/authorize", { data: { accessor: "A" }, response: { data: { approved: false } } }), ctx);
  classify(heldEntry("transit/keys/release-signing/algorithm"), ctx);
  const b = classify(entry("sys/control-group/authorize", { data: { accessor: "B" }, response: { data: { approved: false } } }), ctx);
  const a2 = classify(entry("sys/control-group/authorize", { data: { accessor: "A" }, response: { data: { approved: true } } }), ctx);
  assert.deepEqual([a.chapter, b.chapter, a2.chapter], ["second-key", "algorithm", "second-key"]);
});

test("only story paths in namespace governor are kept", () => {
  assert.equal(isStory({ ...entry("kv/data/breakglass/lock-gates"), type: "request" }), false);
  assert.equal(isStory(entry("kv/data/breakglass/lock-gates")), true);
  assert.equal(isStory({ ...entry("kv/data/breakglass/lock-gates"), request: { path: "kv/data/breakglass/lock-gates", namespace: { path: "" } } }), false);
  assert.equal(isStory(entry("auth/userpass/login/rowan")), false);
});

test("a held read, its approvals and its release are linked by HMACs", () => {
  const ctx = newContext();
  const held = classify(heldEntry("kv/data/breakglass/lock-gates", { op: "read" }), ctx);
  assert.equal(held.kind, "break-glass read held for two keyholders");
  assert.equal(held.ok, true);
  const a1 = classify(entry("sys/control-group/authorize", { as: "ines", data: { accessor: "hmac-acc" }, response: { data: { approved: false } } }), ctx);
  assert.deepEqual([a1.chapter, a1.who, a1.kind], ["second-key", "ines", "approval recorded"]);
  const a2 = classify(entry("sys/control-group/authorize", { as: "kofi", data: { accessor: "hmac-acc" }, response: { data: { approved: true } } }), ctx);
  assert.equal(a2.kind, "approval: enough keyholders now");
  const early = classify(entry("sys/wrapping/unwrap", { data: { token: "hmac-tok" }, error: "1 error occurred:\n\t* invalid request\n\n" }), ctx);
  assert.equal(early.kind, "release refused (still held, or already used)");
  assert.equal(early.chapter, "second-key");
  const out = classify(entry("sys/wrapping/unwrap", { data: { token: "hmac-tok" } }), ctx);
  assert.equal(out.kind, "held read released");
  // A token nobody held (all held requests already have one): not the story's.
  assert.equal(classify(entry("sys/wrapping/unwrap", { data: { token: "someone-elses" } }), ctx), null);
});

test("an EGP refusal is named as one", () => {
  const e = classify(entry("kv/data/breakglass/lock-gates", { op: "read", error: '2 errors occurred: * egp standard policy "governor/gov-breakglass-ticket" evaluation resulted in denial. A trace of the execution ... * permission denied' }));
  assert.equal(e.kind, "refused by the EGP: no valid ticket");
  assert.ok(!/trace of the execution/.test(e.error));
});

test("the algorithm change and SCIM changes", () => {
  const ctx = newContext();
  assert.equal(classify(heldEntry("transit/keys/release-signing/algorithm"), ctx).chapter, "algorithm");
  assert.equal(classify(entry("sys/wrapping/unwrap", { data: { token: "t2" } }), ctx).kind, "held change completed");
  const s = classify({ ...entry("identity/scim/v2/Users/id-mara", { op: "patch" }), auth: { display_name: "token-governor-hr", token_type: "scim" } }, ctx, { "id-mara": "mara" });
  assert.deepEqual([s.chapter, s.who, s.kind], ["left", "HR (SCIM)", "HR changed mara's account"]);
  assert.equal(classify(entry("identity/scim/v2/Users", { op: "list" }), ctx), null);
});

test("createLedger merges nodes in time order and reads incrementally", () => {
  const dir = mkdtempSync(join(tmpdir(), "vgov-ledger-"));
  const f1 = join(dir, "a.log");
  const f2 = join(dir, "b.log");
  const line = (e) => `${JSON.stringify(e)}\n`;
  writeFileSync(f1, line(entry("kv/data/breakglass/lock-gates", { time: "2026-11-11T20:00:01Z", op: "read", type: "request" })) + line(heldEntry("kv/data/breakglass/lock-gates", { time: "2026-11-11T20:00:01Z", op: "read" })));
  writeFileSync(f2, line(entry("sys/control-group/authorize", { time: "2026-11-11T20:00:02Z", as: "ines", data: { accessor: "A" }, response: { data: { approved: false } } })) + "{torn");
  const l = createLedger(`vault-1=${f1},vault-2=${f2}`);
  assert.deepEqual(l.events().map((e) => [e.node, e.kind]), [["vault-1", "break-glass read held for two keyholders"], ["vault-2", "approval recorded"]]);
  appendFileSync(f1, line(entry("sys/wrapping/unwrap", { time: "2026-11-11T20:00:03Z", data: { token: "T" } })));
  assert.equal(l.events().at(-1).kind, "held read released");
  assert.equal(l.events({ since: "2026-11-11T20:00:02Z" }).length, 2);
});
