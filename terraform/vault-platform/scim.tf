# The SCIM client "governor-hr": the HR system that owns the keyholder roster
# (D13). Terraform builds its identity and its boundaries; the roster itself
# (users, the group governor-keyholders, membership) belongs to the client.

# Read after the namespace exists (at plan time on a first run it does not).
data "vault_auth_backend" "token" {
  provider   = vault.governor
  path       = "token"
  depends_on = [vault_namespace.governor]
}

resource "vault_identity_entity" "scim_hr" {
  provider = vault.governor
  name     = "scim-hr"
  policies = []
  metadata = { role = "SCIM client governor-hr (the HR system)" }
}

# A SCIM token is issued against this alias on the token mount.
resource "vault_identity_entity_alias" "scim_hr" {
  provider       = vault.governor
  name           = "scim-hr"
  mount_accessor = data.vault_auth_backend.token.accessor
  canonical_id   = vault_identity_entity.scim_hr.id
}

# Ansible mints the SCIM token from this role (renewable=false: Vault refuses a
# renewable SCIM token, probe P3).
resource "vault_token_auth_backend_role" "scim_hr" {
  provider                = vault.governor
  role_name               = "scim-hr"
  allowed_entity_aliases  = ["scim-hr"]
  allowed_policies        = ["gov-scim"]
  orphan                  = true
  renewable               = false
  token_no_default_policy = true
  token_explicit_max_ttl  = 2592000
}

# The console's own token (D14): periodic, renewed by the API.
resource "vault_token_auth_backend_role" "console" {
  provider                = vault.governor
  role_name               = "gov-console"
  allowed_policies        = ["gov-console"]
  disallowed_policies     = ["default"]
  orphan                  = true
  renewable               = true
  token_period            = 86400
  token_no_default_policy = true
}

# The client itself. alias_mount_accessor (immutable) ties each provisioned
# user to the userpass mount, so a keyholder's login is the SCIM entity.
# deletion_policy: on destroy, remove the users and group it owns.
resource "vault_scim_client" "hr" {
  provider               = vault.governor
  client_name            = "governor-hr"
  access_grant_principal = vault_identity_entity.scim_hr.id
  alias_mount_accessor   = vault_auth_backend.userpass.accessor
  allow_user_adoption    = false
  allow_group_adoption   = false
  max_active_tokens      = 2
  deletion_policy        = "delete_child_resources"
}
