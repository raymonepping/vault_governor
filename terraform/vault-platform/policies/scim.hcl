# gov-scim: the SCIM client governor-hr (the HR system, D13). SCIM endpoints
# only; Vault also limits a SCIM token to them and to its own resources.

path "identity/scim/v2/Users" { capabilities = ["create", "read", "update", "patch", "delete", "list"] }
path "identity/scim/v2/Users/*" { capabilities = ["create", "read", "update", "patch", "delete", "list"] }
path "identity/scim/v2/Groups" { capabilities = ["create", "read", "update", "patch", "delete", "list"] }
path "identity/scim/v2/Groups/*" { capabilities = ["create", "read", "update", "patch", "delete", "list"] }
path "identity/scim/v2/ResourceTypes/*" { capabilities = ["read"] }
path "identity/scim/v2/Schemas/*" { capabilities = ["read"] }
path "identity/scim/v2/ServiceProviderConfig" { capabilities = ["read"] }

# make boundary asks Vault what this token may do (Vault allows it for SCIM tokens).
path "sys/capabilities-self" { capabilities = ["update"] }
