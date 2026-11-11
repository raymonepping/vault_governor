#!/usr/bin/env bash
# scripts/up.sh (make up, D17): the daily start, and the Lab Index's Start
# button (it runs `make up RUNTIME=podman` with stdin closed). Idempotent:
#   - no licence installed: install it from .env, or stop with the instruction;
#   - never built (no cluster init file): run make lab, the whole build;
#   - otherwise: clock, vault-s up and unsealed, vault-1..3 (Transit
#     auto-unseal) and a leader, the people's tokens checked (re-minted only
#     when expired), the app; then the one-shot init container goes.
# Each step says what it found and what it did ("kept" when nothing had to
# change). Volumes are never touched. It never asks a question.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VGOV_ROOT"
step() { printf '\033[1m%-12s\033[0m %s\n' "$1" "$2"; }
was() { vgov_container_state "$1"; }

if [ ! -s "$VGOV_STATE/vault.hclic" ]; then
  ./scripts/license.sh </dev/null || die "up: no Vault Enterprise licence. Put VAULT_LICENSE in .env (see .env.example), then make up again."
fi
[ -s vault-tls/vault.crt ] || ./scripts/gen-certs.sh
if [ ! -s "$VGOV_STATE/vault-init.json" ]; then
  step build "this lab has never been built: make lab (about two minutes)"
  ./scripts/lab.sh
  step built "from nothing; make show-ready before a talk"
  exit 0
fi

step clock-sync "$("$VGOV_ROOT/scripts/clock-sync.sh" 2>&1 | tail -1)"
before=$(was "$(vault_container vault-s)")
"$VGOV_ROOT/scripts/vault-up.sh" >"$BUILD_DIR/up-vault.log" 2>&1 || {
  cat "$BUILD_DIR/up-vault.log" >&2
  die "up: the Vault stacks did not come up (make vault-status, make vault-logs)"
}
step vault "$( [ "$before" = running ] && echo "kept: " )$(tail -1 "$BUILD_DIR/up-vault.log" | sed 's/^vault-up: //')"
"$VGOV_ROOT/scripts/ansible.sh" people >"$BUILD_DIR/up-people.log" 2>&1 || {
  tail -20 "$BUILD_DIR/up-people.log" >&2
  die "up: the people's tokens could not be checked (make people)"
}
step tokens "$(jq -r 'if .changed_total == 0 then "kept: SCIM and console tokens valid" else "re-minted \(.changed_total) (expired)" end' "$BUILD_DIR/ansible-stats/people.json")"
before=$(was vgov-api)
"$VGOV_ROOT/scripts/app-up.sh" >"$BUILD_DIR/up-app.log" 2>&1 || {
  cat "$BUILD_DIR/up-app.log" >&2
  die "up: the app did not come up (make app-logs)"
}
step app "$( [ "$before" = running ] && echo "kept: api, web running" || echo "api, web started ($before before)")"
step init "one-shot volume-init removed after a successful start"
echo "up: done. make verify to check, make doctor if something looks wrong, make show-ready before a talk."
