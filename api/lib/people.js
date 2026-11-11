// lib/people.js: the stage-hand shortcut (D11, docs/security-model.md). One
// presenter plays the keyholders and the contractor: the API logs each of
// them in with THEIR OWN password (read per login from a read-only mount).
// Vault sees distinct entities; the UI says whose token acted. A password is
// never logged.
//
// A person's token is kept and reused until a minute before it expires
// (userpass token_ttl 1h), never revoked after one call: Vault forgets an
// approval when the approver's token is revoked (measured in prompt 06, probe
// P27), so revoking it would undo the approval the presenter just gave.
import { readFileSync } from "node:fs";
import { call, ns } from "./vault.js";

const DIR = process.env.PEOPLE_DIR || "/run/secrets/people";
export const STAGEHANDS = (process.env.STAGEHANDS || "ines,kofi,mara,jonas").split(",");
const cache = new Map(); // user -> { token, exp, entity }

export const isStagehand = (u) => STAGEHANDS.includes(u);

// A fresh login: the Vault call result (ok false with Vault's answer when it
// refuses, e.g. a disabled entity in chapter III).
export async function login(user) {
  if (!isStagehand(user)) throw new Error(`not a stage hand: ${user}`);
  const password = readFileSync(`${DIR}/${user}`, "utf8").trim();
  return call(null, "POST", ns(`auth/userpass/login/${user}`), { body: { password } });
}

export const revoke = (token) => call(token, "POST", ns("auth/token/revoke-self")).catch(() => null);

// as(user, fn): run fn(token) with the person's (cached) token. Returns
// { login, result, entity }: login only when one was needed; when it is
// refused, result is null and login carries Vault's answer.
export async function as(user, fn, now = Date.now()) {
  let c = cache.get(user);
  let l = null;
  if (!c || c.exp - 60_000 < now) {
    l = await login(user);
    if (!l.ok) {
      cache.delete(user);
      return { login: l, result: null };
    }
    c = { token: l.json.auth.client_token, exp: now + l.json.auth.lease_duration * 1000, entity: l.json.auth.entity_id };
    cache.set(user, c);
  }
  return { login: l, result: await fn(c.token), entity: c.entity };
}

// After a reset: revoke every kept token (their approvals go with them).
export async function forgetAll() {
  const all = [...cache.values()];
  cache.clear();
  await Promise.all(all.map((c) => revoke(c.token)));
}
