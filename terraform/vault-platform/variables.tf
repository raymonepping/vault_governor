variable "vault_addr" {
  description = "The cluster on a published loopback port (scripts/tf.sh)."
  type        = string
}

variable "vault_cacert" {
  description = "The lab CA chain (vault-tls/ca-chain.pem)."
  type        = string
}

variable "namespace" {
  description = "The namespace every object of the story lives in (D9)."
  type        = string
  default     = "governor"
}

variable "council_ttl" {
  description = "How long a held request waits for its approvals, in seconds (D10)."
  type        = number
}
