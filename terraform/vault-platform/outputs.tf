output "namespace" {
  value = vault_namespace.governor.path_fq
}

output "userpass_accessor" {
  value = vault_auth_backend.userpass.accessor
}

output "scim_client" {
  value = "identity/scim/client/governor-hr"
}

output "scim_entity_id" {
  value = vault_identity_entity.scim_hr.id
}

output "policies" {
  value = sort(keys(local.policies))
}

output "egps" {
  value = [vault_egp_policy.breakglass_ticket.name, vault_egp_policy.algorithm_target.name]
}
