# gov-keyholder: ines, kofi, mara and jonas. The capability to approve. Whether
# an approval counts is decided by membership of governor-keyholders, which
# the SCIM client owns (D10): jonas has this policy and no membership.

path "sys/control-group/authorize" { capabilities = ["update"] }
path "sys/control-group/request" { capabilities = ["update"] }
