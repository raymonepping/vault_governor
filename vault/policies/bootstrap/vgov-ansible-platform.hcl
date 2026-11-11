# vgov-ansible-platform: Ansible on the cluster (D7). Order and moment: the
# people's userpass logins (passwords, token_policies), the SCIM and console
# tokens, the stage (the break-glass value, written never read; the signing
# key at v1 and the baseline signature), the stage reset, Raft health and
# snapshots, step-down, and the read-only checks of validate and verify.
# It may NOT create a mount, write an ACL or EGP policy, read the break-glass
# value, change the key's algorithm, touch the SCIM roster or approve (D8, D10).
# Written complete in prompt 02: after root revocation nothing can widen it.

# ── People (D11): userpass users in governor ─────────────────────────────────
path "governor/auth/userpass/users" { capabilities = ["list"] }
path "governor/auth/userpass/users/*" { capabilities = ["create", "read", "update", "delete"] }

# ── Tokens minted from Terraform's roles (D13, D14) ──────────────────────────
# sudo: a root-namespace token minting in a child namespace needs it ("root or
# sudo privileges required to directly generate a token in a child namespace",
# prompt 04). The roles still bound the policies (gov-scim, gov-console).
path "governor/auth/token/create/scim-hr" { capabilities = ["update", "sudo"] }
path "governor/auth/token/create/gov-console" { capabilities = ["update", "sudo"] }
path "governor/auth/token/lookup" { capabilities = ["update"] }
path "governor/auth/token/lookup-accessor" { capabilities = ["update"] }
path "governor/auth/token/revoke-accessor" { capabilities = ["update"] }
path "governor/auth/token/roles/*" { capabilities = ["read"] }

# ── Stage (D8): the value is written and its metadata read, never its data ───
path "governor/kv/data/breakglass/*" { capabilities = ["create", "update"] }
path "governor/kv/metadata/breakglass/*" { capabilities = ["read"] }
path "governor/transit/keys/release-signing" { capabilities = ["create", "read", "update", "delete"] }
path "governor/transit/keys/release-signing/config" { capabilities = ["update"] }
path "governor/transit/sign/release-signing" { capabilities = ["update"] }
path "governor/transit/verify/release-signing" { capabilities = ["update"] }

# ── Cluster operations ───────────────────────────────────────────────────────
path "sys/storage/raft/configuration" { capabilities = ["read"] }
path "sys/storage/raft/snapshot" { capabilities = ["read"] }
path "sys/step-down" { capabilities = ["update", "sudo"] }
path "sys/license/status" { capabilities = ["read"] }
path "sys/health" { capabilities = ["read"] }
path "auth/token/lookup" { capabilities = ["update"] }

# ── Read-only checks (validate, verify, doctor) ──────────────────────────────
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/namespaces" { capabilities = ["list"] }
path "sys/namespaces/governor" { capabilities = ["read"] }
path "governor/sys/mounts" { capabilities = ["read"] }
path "governor/sys/auth" { capabilities = ["read"] }
path "governor/sys/policies/acl/gov-*" { capabilities = ["read"] }
path "governor/sys/policies/egp/gov-*" { capabilities = ["read"] }
path "governor/identity/group/name/*" { capabilities = ["read"] }
path "governor/identity/group/id/*" { capabilities = ["read"] }
path "governor/identity/entity/name/*" { capabilities = ["read"] }
path "governor/identity/entity/id/*" { capabilities = ["read"] }
path "governor/identity/scim/client/governor-hr" { capabilities = ["read"] }

# Break glass (make root-regen): Vault 2.0 requires a token as well as the
# key share for sys/generate-root (HCSEC-2026-08). root-regen.sh sends this token.
path "sys/generate-root/*" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── Never ────────────────────────────────────────────────────────────────────
path "governor/transit/keys/release-signing/algorithm" { capabilities = ["deny"] }
path "governor/identity/scim/v2/*" { capabilities = ["deny"] }
path "governor/sys/control-group/*" { capabilities = ["deny"] }
path "governor/sys/mounts/*" { capabilities = ["deny"] }
path "sys/mounts/*" { capabilities = ["deny"] }
path "sys/policies/acl/vgov-*" { capabilities = ["deny"] }
