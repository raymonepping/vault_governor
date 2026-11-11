# Every node writes its own file (/vault/audit is one volume per node). The
# Epilogue merges all three: the node that receives a request logs it
# (docs/capabilities.md, P23).
resource "vault_audit" "file" {
  type        = "file"
  path        = "file"
  description = "The ledger"
  options = {
    file_path     = "/vault/audit/audit.log"
    mode          = "0640" # gid 1000: the API reads the ledger
    hmac_accessor = "true"
  }
}
