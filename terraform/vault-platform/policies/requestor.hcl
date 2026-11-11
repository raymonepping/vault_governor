# gov-requestor: rowan, the duty engineer. May ask for the break-glass value
# and for the algorithm change, but Vault holds both until two members of
# governor-keyholders approve (D10). Approving is not his: no
# sys/control-group/authorize.

path "kv/data/breakglass/*" {
  capabilities = ["read"]
  control_group = {
    factor "keyholders" {
      identity {
        group_names = ["governor-keyholders"]
        approvals   = 2
      }
    }
  }
}

path "transit/keys/release-signing/algorithm" {
  capabilities = ["update"]
  control_group = {
    factor "keyholders" {
      identity {
        group_names = ["governor-keyholders"]
        approvals   = 2
      }
    }
  }
}

# Sign and verify releases; read the key's versions.
path "transit/keys/release-signing" { capabilities = ["read"] }
path "transit/sign/release-signing" { capabilities = ["update"] }
path "transit/verify/release-signing" { capabilities = ["update"] }

# See the state of his own held requests.
path "sys/control-group/request" { capabilities = ["update"] }
