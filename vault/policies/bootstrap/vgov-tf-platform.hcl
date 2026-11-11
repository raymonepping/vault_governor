# vgov-tf-platform: Terraform root vault-platform on the cluster (D7, prompt 04).
# Declared, plannable structure: the audit device, the namespace governor and,
# inside it, the userpass, kv and transit mounts, the gov-* ACL policies (with
# the Control Group factors), the gov-* EGPs, the Control Group config, the
# SCIM client's entity, alias, token roles and the SCIM client itself.
# It may NOT use any of it: no break-glass read, no signing, no key, no user
# password, no SCIM user or group, no approval (D8, D10, D13).
# Written complete in prompt 02: after root revocation nothing can widen it
# (make root-regen CLUSTER=vault is the user's deliberate act).
# A root-namespace token reaches namespace governor through paths prefixed
# governor/ (the provider sends X-Vault-Namespace; Vault checks this prefix).

# ── Audit, root namespace (sudo: Vault requires it on sys/audit/*) ───────────
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/audit/file" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── The namespace ────────────────────────────────────────────────────────────
path "sys/namespaces" { capabilities = ["list"] }
path "sys/namespaces/governor" { capabilities = ["create", "read", "update", "delete"] }

# ── Control Group config (root namespace or governor: prompt 03 decides) ─────
path "sys/config/control-group" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "governor/sys/config/control-group" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── Mounts in governor ───────────────────────────────────────────────────────
path "governor/sys/mounts" { capabilities = ["read"] }
path "governor/sys/mounts/kv" { capabilities = ["create", "read", "update", "delete"] }
path "governor/sys/mounts/transit" { capabilities = ["create", "read", "update", "delete"] }
path "governor/sys/mounts/kv/tune" { capabilities = ["read", "update"] }
path "governor/sys/mounts/transit/tune" { capabilities = ["read", "update"] }
path "governor/kv/config" { capabilities = ["create", "read", "update"] }

# ── Auth in governor (enable, read and tune need sudo; the provider reads
#    sys/mounts/auth/<path>) ──────────────────────────────────────────────────
path "governor/sys/auth" { capabilities = ["read"] }
path "governor/sys/auth/userpass" { capabilities = ["create", "read", "update", "delete", "sudo"] }
path "governor/sys/auth/userpass/tune" { capabilities = ["read", "update", "sudo"] }
path "governor/sys/mounts/auth/userpass" { capabilities = ["read"] }
path "governor/sys/mounts/auth/userpass/tune" { capabilities = ["read", "update", "sudo"] }
path "governor/sys/mounts/auth/token" { capabilities = ["read"] }
path "governor/sys/auth/token" { capabilities = ["read"] }

# ── Token roles for the SCIM client and the console (D13, D14) ───────────────
path "governor/auth/token/roles" { capabilities = ["list"] }
path "governor/auth/token/roles/scim-hr" { capabilities = ["create", "read", "update", "delete"] }
path "governor/auth/token/roles/gov-console" { capabilities = ["create", "read", "update", "delete"] }

# ── Identity in governor: the SCIM client's own entity and alias ─────────────
path "governor/identity/entity" { capabilities = ["create", "update"] }
path "governor/identity/entity/id/*" { capabilities = ["create", "read", "update", "delete"] }
path "governor/identity/entity/name/*" { capabilities = ["create", "read", "update", "delete"] }
path "governor/identity/entity-alias" { capabilities = ["create", "update"] }
path "governor/identity/entity-alias/id/*" { capabilities = ["create", "read", "update", "delete"] }
path "governor/identity/lookup/entity" { capabilities = ["update"] }

# ── The SCIM client config (not its users or groups) ─────────────────────────
path "governor/identity/scim/client" { capabilities = ["list"] }
path "governor/identity/scim/client/governor-hr" { capabilities = ["create", "read", "update", "delete"] }

# ── Policies: the story's gov-* ACLs and EGPs only ───────────────────────────
path "governor/sys/policies/acl" { capabilities = ["list"] }
path "governor/sys/policies/acl/gov-*" { capabilities = ["create", "read", "update", "delete"] }
path "governor/sys/policy/gov-*" { capabilities = ["create", "read", "update", "delete"] }
path "governor/sys/policies/egp" { capabilities = ["list"] }
path "governor/sys/policies/egp/gov-*" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# ── The provider ─────────────────────────────────────────────────────────────
path "auth/token/create" { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }
path "sys/license/status" { capabilities = ["read"] }

# ── Never ────────────────────────────────────────────────────────────────────
path "governor/kv/data/*" { capabilities = ["deny"] }
path "governor/kv/metadata/*" { capabilities = ["deny"] }
path "governor/transit/keys/*" { capabilities = ["deny"] }
path "governor/transit/sign/*" { capabilities = ["deny"] }
path "governor/auth/userpass/users/*" { capabilities = ["deny"] }
path "governor/auth/token/create/*" { capabilities = ["deny"] }
path "governor/identity/scim/v2/*" { capabilities = ["deny"] }
path "governor/identity/group/*" { capabilities = ["deny"] }
path "governor/sys/control-group/*" { capabilities = ["deny"] }
path "sys/policies/acl/vgov-*" { capabilities = ["deny"] }
