# The people log in here (D11). SCIM puts each keyholder's alias on this mount
# (D13), so a keyholder's login is the SCIM entity (probe P6).
resource "vault_auth_backend" "userpass" {
  provider    = vault.governor
  type        = "userpass"
  path        = "userpass"
  description = "Kestrel Harbour Authority people"
}

# Chapter I: the break-glass value lives at kv/breakglass/lock-gates. Ansible
# writes it (D8); Terraform never holds it.
resource "vault_mount" "kv" {
  provider    = vault.governor
  path        = "kv"
  type        = "kv"
  options     = { version = "2" }
  description = "Break-glass values"
}

# Chapter II: the key release-signing is runtime state (Ansible, D8), because
# the story changes its algorithm.
resource "vault_mount" "transit" {
  provider    = vault.governor
  path        = "transit"
  type        = "transit"
  description = "Release signing"
}
