#!/usr/bin/env bash
# scripts/verify.sh [section...]: end-to-end checks of the running lab.
# Sections: podman vault units platform stage app console boundary drift
# idempotency secrets rehearsal (default: all). Read-only except rehearsal,
# which plays every chapter and ends with make stage-reset. The browser-level checks are Playwright's: make test-ui.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VGOV_ROOT"

pass=0
fail=0
ok() {
  printf '  \033[32m✓\033[0m %s\n' "$*"
  pass=$((pass + 1))
}
bad() {
  printf '  \033[31m✗\033[0m %s\n' "$*"
  fail=$((fail + 1))
}
check() {
  local msg=$1
  shift
  if "$@" >/dev/null 2>&1; then ok "$msg"; else bad "$msg"; fi
}
healthy() {
  local _
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(podman container inspect "$1" --format '{{.State.Health.Status}}' 2>/dev/null)" = healthy ] && return 0
    sleep 3
  done
  return 1
}
native() { # <image>: pulled and the host's architecture, not emulated
  [ "$(podman image inspect "$1" --format '{{.Architecture}}' 2>/dev/null)" = "$(podman info --format '{{.Host.Arch}}')" ]
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

section_podman() {
  echo "podman"
  check "Podman machine answers" podman info
  check "network vgov-internal exists" podman network exists vgov-internal
  check "Vault Enterprise image is native arm64" native "$(vgov_conf VAULT_ENT_IMAGE)"
  local skew=99 vm
  if vm=$(podman machine ssh date +%s 2>/dev/null | tr -d '\r' | tail -1) && [ -n "$vm" ]; then
    skew=$(($(date +%s) - vm))
    skew=${skew#-}
  fi
  check "VM clock within 5s of the Mac (${skew}s; fix: make clock-sync)" test "$skew" -le 5
}

section_vault() {
  echo "vault"
  check "listener certificate chains to the lab CA" openssl verify -CAfile vault-tls/ca-chain.pem vault-tls/vault.crt
  local node s
  for node in vault-s $VGOV_CLUSTER_NODES; do
    check "$(vault_container "$node") healthy" healthy "$(vault_container "$node")"
    vault_node "$node"
    s=$(vault_json 2>/dev/null || echo '{}')
    check "$node initialized and unsealed" jq -e '.initialized and (.sealed | not)' <<<"$s"
    check "$node runs 2.2.1+ent" jq -e '.version == "2.2.1+ent"' <<<"$s"
  done
  vault_node vault-s
  check "vault-s is Shamir-sealed" jq -e '.type == "shamir"' <<<"$(vault_json 2>/dev/null || echo '{}')"
  for node in $VGOV_CLUSTER_NODES; do
    vault_node "$node"
    check "$node is Transit-sealed" jq -e '.type == "transit"' <<<"$(vault_json 2>/dev/null || echo '{}')"
  done
  check "every node's own seal token is accepted by vault-s" ./scripts/seal-token-status.sh

  vault_cluster
  vault_token ansible-platform
  local peers leaders
  peers=$(vault operator raft list-peers -format=json 2>/dev/null || echo '{}')
  check "three Raft voters" jq -e '[.data.config.servers[] | select(.voter)] | length == 3' <<<"$peers"
  leaders=$(jq '[.data.config.servers[] | select(.leader)] | length' <<<"$peers" 2>/dev/null || echo 0)
  check "exactly one leader" test "$leaders" = 1
  check "licence autoloaded on the cluster" bash -c 'vault read -format=json sys/license/status | jq -e ".data.autoloaded.license_id != null"'
  check "licence has Namespaces, Control Groups and Sentinel (make license-features)" ./scripts/license-features.sh
  unset VAULT_TOKEN

  check "no root token in the seal init file" jq -e 'has("root_token") | not' .secrets/vault/seal-init.json
  check "no root token in the cluster init file" jq -e 'has("root_token") | not' .secrets/vault/vault-init.json
  check "no regenerated root token lying around (make root-revoke)" bash -c '! compgen -G ".secrets/vault/root-*" >/dev/null'
  local t
  for t in tf-seal ansible-seal tf-platform ansible-platform; do
    check "scoped token $t is 0600" test "$(stat -f '%Lp' ".secrets/vault/tokens/$t")" = 600
  done
  check "Terraform state is 0600" bash -c '! find .secrets/terraform -name "*.tfstate*" ! -perm 600 | grep . >/dev/null'
}

ns=$(vgov_conf VGOV_NAMESPACE)

section_platform() {
  echo "platform"
  vault_cluster
  vault_token ansible-platform
  check "namespace $ns exists" bash -c "vault read -format=json sys/namespaces/$ns | jq -e '.data.path == \"$ns/\"'"
  check "mounts kv/ (v2) and transit/ in $ns" bash -c "vault read -format=json -namespace=$ns sys/mounts | jq -e '(.data[\"kv/\"].options.version == \"2\") and (.data | has(\"transit/\"))'"
  check "userpass/ enabled in $ns" bash -c "vault read -format=json -namespace=$ns sys/auth | jq -e '.data | has(\"userpass/\")'"
  check "audit device file/ enabled (root namespace)" bash -c 'vault read -format=json sys/audit | jq -e ".data | has(\"file/\")"'
  check "gov-requestor holds the Control Group factor on both protected paths" bash -c \
    "vault read -format=json -namespace=$ns sys/policies/acl/gov-requestor | jq -e '.data.policy | test(\"breakglass\") and test(\"release-signing/algorithm\") and ([scan(\"control_group\")] | length == 2) and test(\"governor-keyholders\")'"
  local e
  for e in gov-breakglass-ticket gov-algorithm-target; do
    check "EGP $e is hard-mandatory" bash -c "vault read -format=json -namespace=$ns sys/policies/egp/$e | jq -e '.data.enforcement_level == \"hard-mandatory\"'"
  done
  check "SCIM client governor-hr ties users to userpass/" bash -c \
    "a=\$(vault read -format=json -namespace=$ns sys/auth | jq -r '.data[\"userpass/\"].accessor'); vault read -format=json -namespace=$ns identity/scim/client/governor-hr | jq -e --arg a \"\$a\" '.data.alias_mount_accessor == \$a'"
  local want
  want=$(jq '[.groups[0].members[]] | length' config/roster.json)
  check "governor-keyholders has its $want SCIM members" bash -c "vault read -format=json -namespace=$ns identity/group/name/governor-keyholders | jq -e '.data.member_entity_ids | length == $want'"
  unset VAULT_TOKEN
  check "the SCIM roster is converged (make roster: changed=0)" bash -c "./scripts/roster.sh | tail -1 | grep -F 'changed=0' >/dev/null"
  check "phase validate passes (every person signs in; keyholders are the SCIM entities)" ./scripts/ansible.sh validate
}

section_stage() {
  echo "stage"
  vault_cluster
  vault_token ansible-platform
  check "break-glass value staged (metadata only; Ansible cannot read it)" bash -c "vault read -format=json -namespace=$ns kv/metadata/breakglass/lock-gates | jq -e '.data.current_version >= 1'"
  check "release-signing exists, deletable by the reset" bash -c "vault read -format=json -namespace=$ns transit/keys/release-signing | jq -e '.data.deletion_allowed and .data.type == \"ecdsa-p256\"'"
  unset VAULT_TOKEN
  check "baseline signed over today's manifest bytes" bash -c "jq -e --arg d \"\$(shasum -a 256 .build/stage/manifest.json | cut -d' ' -f1)\" '.manifest_sha256 == \$d and .key_version == 1' .build/stage/baseline.json"
}

section_app() {
  echo "app"
  check "vgov-api healthy" healthy vgov-api
  check "API health: three nodes, the console token, three audit logs readable" bash -c \
    "curl -sf http://127.0.0.1:$(vgov_conf VGOV_PORT_API)/api/health | jq -e '(.nodes | map(select(.reachable)) | length == 3) and .console_token and ([.audit_logs[] | select(.error == null)] | length == 3)'"
  check "API image is native arm64" native "$(vgov_conf VGOV_IMAGE_PREFIX)/api:$(vgov_conf VGOV_IMAGE_TAG)"
  check "no break-glass value in the running API's files (/app)" bash -c "! podman exec vgov-api grep -rlF \"\$(jq -r .breakglass.fields.recovery_code config/story.json)\" /app"
  check "the API holds four stage-hand passwords, not rowan's" bash -c "podman exec vgov-api ls /run/secrets/people | sort | tr '\n' ' ' | grep -Fx 'ines jonas kofi mara ' >/dev/null"
}

section_console() {
  echo "console"
  local web
  web="localhost:$(vgov_conf VGOV_PORT_WEB)"
  check "vgov-web healthy" healthy vgov-web
  check "web image is native arm64" native "$(vgov_conf VGOV_IMAGE_PREFIX)/web:$(vgov_conf VGOV_IMAGE_TAG)"
  check "TLS 1.3, chain verifies against the lab CA" bash -c "openssl s_client -connect $web -tls1_3 -servername localhost -CAfile vault-tls/ca-chain.pem -verify_return_error </dev/null 2>/dev/null | grep -F 'Verify return code: 0' >/dev/null"
  check "TLS 1.2 refused" bash -c "! openssl s_client -connect $web -tls1_2 </dev/null >/dev/null 2>&1"
  check "Content-Security-Policy without unsafe-inline scripts" bash -c "curl -sI --cacert vault-tls/ca-chain.pem https://$web/ | grep -i '^content-security-policy:' | grep -F \"script-src 'self'\" | grep -vF unsafe-inline >/dev/null"
  check "the console page is served (200)" bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --cacert vault-tls/ca-chain.pem 'https://$web/')\" = 200"
  check "the console proxies the API" bash -c "curl -sf --cacert vault-tls/ca-chain.pem https://$web/api/health | jq -e .ok >/dev/null"
  check "only rowan may sign in to the console (403 for a keyholder)" bash -c "test \"\$(curl -s -o /dev/null -w '%{http_code}' --cacert vault-tls/ca-chain.pem -H 'content-type: application/json' -d '{\"username\":\"ines\",\"password\":\"x\"}' https://$web/api/session)\" = 403"
  check "no one-shot init container left behind" bash -c "! podman ps -a --filter name=^vgov-volume_init --format '{{.Names}}' | grep . >/dev/null"
}

section_units() {
  echo "units"
  check "story and roster validate (make story-check)" node scripts/story-check.js
  check "script unit tests (node --test scripts/)" bash -c "node --test scripts/*.test.js"
  check "API unit tests (node --test api/test/)" bash -c "cd api && NODE_ENV=test node --test 'test/*.test.js'"
  check "static checks (make lint)" ./scripts/lint.sh
}

section_idempotency() {
  echo "idempotency"
  check "every Ansible phase and the roster changed=0 (make idempotency)" ./scripts/idempotency.sh
}

section_secrets() {
  echo "secrets"
  check "no known secret in state, .build/ or logs (make secret-scan)" ./scripts/secret-scan.sh
}

section_rehearsal() {
  echo "rehearsal"
  check "every chapter through the console, every way it must fail (make rehearsal)" ./scripts/rehearsal.sh
}

section_boundary() {
  echo "boundary"
  check "each scoped token does its own job and nothing else (make boundary)" ./scripts/boundary-check.sh
}

section_drift() {
  echo "drift"
  check "Terraform: every root plans clean (make tf-plan-all)" make -s tf-plan-all
  check "Ansible: every phase changes nothing in check mode (make drift)" ./scripts/drift.sh
}

all="podman vault units platform stage app console boundary drift idempotency secrets rehearsal"
sections=${*:-$all}
for s in $sections; do
  if declare -F "section_$s" >/dev/null; then
    "section_$s"
  else
    echo "$s"
    echo "  - not built yet"
  fi
done

echo
echo "verify: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
