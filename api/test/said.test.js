import { test } from "node:test";
import assert from "node:assert/strict";
import { said, scrub, short } from "../lib/said.js";

test("ciphertexts are shortened to version + 8 characters", () => {
  assert.equal(short("vault:v3:ABCDEFGHIJKLMNOP"), "vault:v3:ABCDEFGH...");
  assert.equal(short(42), 42);
});

test("tokens never reach the drawer", () => {
  const out = scrub({
    token: "x",
    data: { client_token: "y", ciphertext: "vault:v1:12345678abcdef", keep: 1 },
  });
  assert.deepEqual(out, {
    data: { ciphertext: "vault:v1:12345678...", keep: 1 },
  });
});

test("a wrapped answer keeps its accessor and metadata, not its token", () => {
  const r = {
    ok: true,
    status: 200,
    node: "vault-1",
    errors: [],
    requestId: "rid",
    json: {
      wrap_info: {
        token: "secret",
        accessor: "acc",
        ttl: 120,
        creation_time: "t",
        creation_path: "kv/data/breakglass/lock-gates",
      },
    },
  };
  const v = said("console", "GET", "kv/data/breakglass/lock-gates", r);
  assert.equal(v.wrap_info.accessor, "acc");
  assert.equal(JSON.stringify(v).includes("secret"), false);
  assert.equal(v.as, "console");
  assert.equal(v.request_id, "rid");
});

test("Vault's errors are kept verbatim", () => {
  const v = said("rowan", "POST", "transit/sign/release-signing", {
    status: 400,
    errors: ["Request needs further authorization"],
    json: null,
  });
  assert.deepEqual(v.errors, ["Request needs further authorization"]);
  assert.equal(v.status, 400);
});
