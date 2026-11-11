# The people's and the clients' policies (the People table of the brief). The
# requestor's carries the Control Group factor on both protected paths (D10).
locals {
  policies = {
    "gov-requestor" = "requestor.hcl"
    "gov-keyholder" = "keyholder.hcl"
    "gov-console"   = "console.hcl"
    "gov-scim"      = "scim.hcl"
  }
}

resource "vault_policy" "gov" {
  for_each = local.policies
  provider = vault.governor
  name     = each.key
  policy   = file("${path.module}/policies/${each.value}")
}
