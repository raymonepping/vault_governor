# gov-console: the API's own token (D14). Read-only views for the story: the
# key's versions and public keys (the lab's verifier), the keyholder group's
# members, the state of held requests, the rules themselves. Nothing else: a
# path the API does not call is not here (make boundary checks the denials). It cannot
# read the value, approve, sign or change anything.

path "transit/keys/release-signing" { capabilities = ["read"] }
path "transit/export/public-key/release-signing/*" { capabilities = ["read"] }
path "identity/group/name/governor-keyholders" { capabilities = ["read"] }
path "sys/control-group/request" { capabilities = ["update"] }
path "sys/policies/acl/gov-*" { capabilities = ["read"] }
path "sys/policies/egp/gov-*" { capabilities = ["read"] }

path "auth/token/lookup-self" { capabilities = ["read"] }
path "auth/token/renew-self" { capabilities = ["update"] }

# make boundary asks Vault what this token may do (no default policy here).
path "sys/capabilities-self" { capabilities = ["update"] }
