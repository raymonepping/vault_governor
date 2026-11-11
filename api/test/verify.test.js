// The lab's verifier with real keys: ECDSA P-256 (PEM) and ML-DSA-65 (raw,
// as Vault exports it), and the tampered cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verify } from "../lib/verify.js";

const data = '{"name":"lock-gate-controller","version":"4.2.0"}';

test("ECDSA P-256 with a PEM public key", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const sig = `vault:v1:${sign("sha256", Buffer.from(data), privateKey).toString("base64")}`;
  const pem = publicKey.export({ type: "spki", format: "pem" });
  assert.deepEqual(verify(data, sig, pem), { version: 1, keyType: "ec", valid: true });
  assert.equal(verify(`${data} `, sig, pem).valid, false);
});

test("ML-DSA-65 with Vault's raw 1952-byte public key", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ml-dsa-65");
  const der = publicKey.export({ type: "spki", format: "der" });
  const raw = der.subarray(der.length - 1952).toString("base64");
  const sig = `vault:v2:${sign(null, Buffer.from(data), privateKey).toString("base64")}`;
  assert.deepEqual(verify(data, sig, raw), { version: 2, keyType: "ml-dsa-65", valid: true });
  assert.equal(verify("tampered", sig, raw).valid, false);
});

test("not a Transit signature, or a broken key: an error, never valid", () => {
  assert.equal(verify(data, "abc", "x").error, "not a Transit signature");
  assert.ok(verify(data, "vault:v1:AAAA", "bm90IGEga2V5").error);
});
