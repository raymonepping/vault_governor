// lib/verify.js: the lab's own verifier (chapter II, probe P18). It checks a
// Transit signature with node:crypto and only the public key, the way a
// downstream consumer would. Its answer is the compatibility result: a "no"
// is shown as a no.
import { createPublicKey, verify as nodeVerify } from "node:crypto";

// Vault exports an ML-DSA-65 public key as 1952 raw bytes; node:crypto wants
// SPKI DER: this header (OID 2.16.840.1.101.3.4.3.18) makes it one.
const MLDSA65_SPKI = Buffer.from("308207b2300b0609608648016503040312038207a100", "hex");

export function publicKey(pub) {
  const s = String(pub || "").trim();
  if (s.startsWith("-----BEGIN")) return createPublicKey(s);
  const raw = Buffer.from(s, "base64");
  if (raw.length === 1952) return createPublicKey({ key: Buffer.concat([MLDSA65_SPKI, raw]), format: "der", type: "spki" });
  return createPublicKey({ key: raw, format: "der", type: "spki" });
}

// verify(bytes, "vault:vN:<base64>", publicKey) -> { version, keyType, valid } or { version, error }
export function verify(data, signature, pub) {
  const m = /^vault:v(\d+):(.+)$/.exec(String(signature || ""));
  if (!m) return { version: null, error: "not a Transit signature" };
  const version = Number(m[1]);
  try {
    const key = publicKey(pub);
    const type = key.asymmetricKeyType;
    const valid = nodeVerify(type === "ec" ? "sha256" : null, Buffer.from(data), key, Buffer.from(m[2], "base64"));
    return { version, keyType: type, valid };
  } catch (e) {
    return { version, error: String(e.message).slice(0, 160) };
  }
}
