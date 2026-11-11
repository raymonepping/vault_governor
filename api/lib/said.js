// lib/said.js: "Vault said", the drawer behind every action. Exactly what
// Vault answered, minus anything secret: no token (a wrapping token keeps only
// its accessor and metadata), ciphertexts shortened to version + 8 characters.

export const short = (ct) =>
  typeof ct === "string"
    ? ct.replace(/^(vault:v\d+:)(.{8}).*$/s, "$1$2...")
    : ct;

// Recursively shorten ciphertexts and drop any field that is a token.
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (/^(token|client_token|wrapping_token|secret_id)$/.test(k)) continue;
      out[k] = k === "ciphertext" ? short(x) : scrub(x);
    }
    return out;
  }
  return v;
}

// said(as, method, path, result): the block every action response carries.
export function said(as, method, path, r) {
  const wi = r?.json?.wrap_info;
  return {
    method,
    path,
    status: r?.status ?? null,
    as,
    node: r?.node ?? null,
    errors: r?.errors ?? [],
    request_id: r?.requestId ?? null,
    ...(wi
      ? {
          wrap_info: {
            accessor: wi.accessor,
            ttl: wi.ttl,
            creation_time: wi.creation_time,
            creation_path: wi.creation_path,
          },
        }
      : {}),
    data: r?.json?.data ? scrub(r.json.data) : null,
  };
}
