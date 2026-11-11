# vgov-probe: prompt 03's scratch probe (make probe). Minted by Ansible
# (bootstrap) with a 4h TTL before root is revoked (docs/STATE.md). Everything
# it may touch lives in a scratch namespace probe-<epoch>, deleted at the end
# of every probe run, plus a scratch audit device. It has no path in governor.

path "sys/namespaces" { capabilities = ["list"] }
path "sys/namespaces/probe-*" { capabilities = ["create", "read", "update", "delete"] }
# Everything inside a scratch namespace (mounts, auth, policies, EGPs,
# identity, SCIM, tokens, control groups, wrapping).
path "probe-*" { capabilities = ["create", "read", "update", "delete", "list", "patch", "sudo"] }

# Q2: is the Control Group config root-only? (The probe restores what it found.)
path "sys/config/control-group" { capabilities = ["create", "read", "update", "delete", "sudo"] }

# Audit rules (scratch device; sudo: Vault requires it).
path "sys/audit" { capabilities = ["read", "sudo"] }
path "sys/audit/probe-file" { capabilities = ["create", "read", "update", "delete", "sudo"] }

path "sys/license/status" { capabilities = ["read"] }
path "sys/storage/raft/configuration" { capabilities = ["read"] }
path "auth/token/lookup-self" { capabilities = ["read"] }

path "governor/*" { capabilities = ["deny"] }
path "sys/namespaces/governor" { capabilities = ["deny"] }
path "sys/policies/acl/vgov-*" { capabilities = ["deny"] }
