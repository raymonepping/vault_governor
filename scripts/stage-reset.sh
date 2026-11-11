#!/usr/bin/env bash
# scripts/stage-reset.sh (make stage-reset, D18): after a rehearsal or a show.
# The roster back to config/roster.json (SCIM), the key release-signing back
# to v1 ecdsa-p256 with a fresh baseline. The break-glass value stays. Held
# requests expire by themselves (Vault has no cancel). CONFIRM=yes skips the
# question.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VGOV_ROOT"
answer=${CONFIRM:-}
if [ "$answer" != yes ]; then
  printf 'This resets the roster, deletes release-signing and stages it again at v1. Type yes: '
  read -r answer
fi
[ "$answer" = yes ] || {
  echo "Aborted."
  exit 1
}
./scripts/roster.sh
./scripts/ansible.sh stage-reset
./scripts/ansible.sh stage
echo "stage-reset: roster converged, release-signing at v1, baseline signed again"
