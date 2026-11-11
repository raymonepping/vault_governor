# Sentinel EGPs (D12): rules on top of the ACL policy, before any approval.
# Neither is the two-person rule; the Control Group factor is.
resource "vault_egp_policy" "breakglass_ticket" {
  provider          = vault.governor
  name              = "gov-breakglass-ticket"
  paths             = ["kv/data/breakglass/*"]
  enforcement_level = "hard-mandatory"
  policy            = file("${path.module}/../../vault/sentinel/gov-breakglass-ticket.sentinel")
}

resource "vault_egp_policy" "algorithm_target" {
  provider          = vault.governor
  name              = "gov-algorithm-target"
  paths             = ["transit/keys/release-signing/algorithm"]
  enforcement_level = "hard-mandatory"
  policy            = file("${path.module}/../../vault/sentinel/gov-algorithm-target.sentinel")
}

# How long a held request waits. The root namespace's config is the one Vault
# applies to requests in governor (probe P10); a namespaced one is ignored.
resource "vault_config_control_group" "council" {
  max_ttl = var.council_ttl
}
