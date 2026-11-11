#!/usr/bin/env node
// scripts/roster.js (make roster, phase 9): the HR system. Reconciles
// config/roster.json into Vault through SCIM as the client governor-hr (D13),
// prints each change and `changed=N`. Exit 1 with Vault's answer on any
// refusal. Environment (scripts/roster.sh sets it): VAULT_ADDR, VGOV_NAMESPACE,
// SCIM_TOKEN_FILE (a path; the token is read from it, never printed),
// NODE_EXTRA_CA_CERTS (the lab CA).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile, scimClient } from "../api/lib/scim.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const need = (k) => process.env[k] || (console.error(`roster: ${k} is not set (run make roster)`), process.exit(2));
const tokenFile = need("SCIM_TOKEN_FILE");
const client = scimClient({
  addr: need("VAULT_ADDR"),
  namespace: need("VGOV_NAMESPACE"),
  token: () => readFileSync(tokenFile, "utf8").trim(),
});
const roster = JSON.parse(readFileSync(join(root, "config/roster.json"), "utf8"));
try {
  const { changed, changes } = await reconcile(client, roster);
  for (const c of changes) console.log(`roster: ${c}`);
  console.log(`roster: ${roster.users.length} users, ${roster.groups.length} group; changed=${changed}`);
} catch (e) {
  console.error(`roster: ${e.message}`);
  process.exit(1);
}
