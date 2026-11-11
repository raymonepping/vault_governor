#!/usr/bin/env bash
# scripts/roster.sh (make roster): run the SCIM client governor-hr against the
# cluster (D13). The SCIM token stays in its file; only its path is passed.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
token="$VGOV_STATE/tokens/scim-hr"
[ -s "$token" ] || die "roster: no SCIM token at ${token#"$VGOV_ROOT"/} (make people mints it)"
vault_cluster
VGOV_NAMESPACE=$(vgov_conf VGOV_NAMESPACE) SCIM_TOKEN_FILE="$token" NODE_EXTRA_CA_CERTS="$VAULT_CACERT" \
  VAULT_ADDR="$VAULT_ADDR" node "$VGOV_ROOT/scripts/roster.js"
