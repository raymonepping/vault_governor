#!/usr/bin/env bash
# scripts/boundary-check.sh (make boundary): prove the Terraform/Ansible
# boundary Vault enforces (golden_ticket's format). Each scoped token asks
# sys/capabilities-self what it may do on paths it must and must not touch.
# Never prints a token. Rows: token|vault|path|allow:cap or deny:cap.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"

checks=(
  # vault-s (prompt 02)
  "tf-seal|seal|sys/mounts/transit|allow:create"
  "tf-seal|seal|auth/token/roles/autounseal|allow:update"
  "tf-seal|seal|sys/audit/file|allow:sudo"
  "tf-seal|seal|auth/token/create/autounseal|deny:update"
  "tf-seal|seal|sys/policies/acl/vgov-tf-seal|deny:update"
  "ansible-seal|seal|auth/token/create/autounseal|allow:update"
  "ansible-seal|seal|auth/token/roles/autounseal|deny:update"
  "ansible-seal|seal|sys/policies/acl/autounseal|deny:update"
  "ansible-seal|seal|sys/mounts/transit|deny:create"
  "ansible-seal|seal|sys/policies/acl/vgov-ansible-seal|deny:update"
  # the cluster: tool tokens (prompt 02). A root-namespace token reaches
  # namespace governor through governor/ paths.
  "tf-platform|vault|sys/namespaces/governor|allow:create"
  "tf-platform|vault|governor/sys/mounts/kv|allow:create"
  "tf-platform|vault|governor/sys/auth/userpass|allow:sudo"
  "tf-platform|vault|governor/sys/policies/acl/gov-requestor|allow:update"
  "tf-platform|vault|governor/sys/policies/egp/gov-breakglass-ticket|allow:update"
  "tf-platform|vault|governor/identity/scim/client/governor-hr|allow:update"
  "tf-platform|vault|sys/audit/file|allow:sudo"
  "tf-platform|vault|governor/kv/data/breakglass/lock-gates|deny:read"
  "tf-platform|vault|governor/transit/keys/release-signing|deny:create"
  "tf-platform|vault|governor/transit/sign/release-signing|deny:update"
  "tf-platform|vault|governor/auth/userpass/users/rowan|deny:update"
  "tf-platform|vault|governor/identity/scim/v2/Users|deny:create"
  "tf-platform|vault|governor/sys/control-group/authorize|deny:update"
  "tf-platform|vault|sys/policies/acl/vgov-tf-platform|deny:update"
  "ansible-platform|vault|governor/auth/userpass/users/rowan|allow:update"
  "ansible-platform|vault|governor/auth/token/create/scim-hr|allow:update"
  "ansible-platform|vault|governor/kv/data/breakglass/lock-gates|allow:create"
  "ansible-platform|vault|governor/kv/data/breakglass/lock-gates|deny:read"
  "ansible-platform|vault|governor/transit/keys/release-signing|allow:create"
  "ansible-platform|vault|governor/transit/keys/release-signing/algorithm|deny:update"
  "ansible-platform|vault|governor/identity/scim/v2/Users|deny:create"
  "ansible-platform|vault|governor/sys/control-group/authorize|deny:update"
  "ansible-platform|vault|governor/sys/mounts/kv|deny:create"
  "ansible-platform|vault|governor/sys/policies/acl/gov-requestor|deny:update"
  "ansible-platform|vault|governor/sys/policies/egp/gov-breakglass-ticket|deny:update"
  "ansible-platform|vault|sys/policies/acl/vgov-ansible-platform|deny:update"
)

fails=0
checked=0
skipped=0
for check in "${checks[@]}"; do
  IFS='|' read -r name cluster path expect <<<"$check"
  file="$VGOV_STATE/tokens/$name"
  if [ ! -s "$file" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  if [ "$cluster" = seal ]; then vault_node vault-s; else vault_cluster; fi
  caps=$(vcurl "$(cat "$file")" -sS --cacert "$VAULT_CACERT" \
    -X POST -d "{\"paths\":[\"$path\"]}" "$VAULT_ADDR/v1/sys/capabilities-self" |
    jq -r --arg p "$path" 'if .errors then "ERROR" else ((.data // .)[$p] // [] | join(",")) end')
  mode=${expect%%:*}
  cap=${expect#*:}
  if [ "$caps" = ERROR ]; then
    # A refused question proves nothing, also not a deny.
    printf '  \033[31mFAIL\033[0m %-17s %-5s %-6s %s (capabilities-self refused)\n' "${who:-$name}" "$mode" "$cap" "$path"
    fails=$((fails + 1))
    checked=$((checked + 1))
    continue
  fi
  has=no
  [[ ",$caps," == *",$cap,"* || ",$caps," == *",root,"* ]] && has=yes
  if { [ "$mode" = allow ] && [ "$has" = yes ]; } || { [ "$mode" = deny ] && [ "$has" = no ]; }; then
    printf '  \033[32mok\033[0m   %-17s %-5s %-6s %s\n' "$name" "$mode" "$cap" "$path"
  else
    printf '  \033[31mFAIL\033[0m %-17s %-5s %-6s %s (has: %s)\n' "$name" "$mode" "$cap" "$path" "${caps:-none}"
    fails=$((fails + 1))
  fi
  checked=$((checked + 1))
done
# ── People and clients in namespace governor (prompt 04) ─────────────────────
# who|path|allow:cap or deny:cap. A person is logged in with their own
# password (person_login); console and scim-hr are token files. Paths are
# relative to the namespace. Each person's token is revoked after the check.
ns=$(vgov_conf VGOV_NAMESPACE)
people_checks=(
  "rowan|kv/data/breakglass/lock-gates|allow:read"
  "rowan|transit/keys/release-signing/algorithm|allow:update"
  "rowan|transit/sign/release-signing|allow:update"
  "rowan|sys/control-group/authorize|deny:update"
  "rowan|identity/scim/v2/Users|deny:create"
  "rowan|transit/keys/release-signing/config|deny:update"
  "ines|sys/control-group/authorize|allow:update"
  "ines|kv/data/breakglass/lock-gates|deny:read"
  "ines|transit/sign/release-signing|deny:update"
  "kofi|sys/control-group/authorize|allow:update"
  "kofi|kv/data/breakglass/lock-gates|deny:read"
  "mara|sys/control-group/authorize|allow:update"
  "mara|transit/keys/release-signing/algorithm|deny:update"
  "jonas|sys/control-group/authorize|allow:update"
  "jonas|kv/data/breakglass/lock-gates|deny:read"
  "console|transit/keys/release-signing|allow:read"
  "console|transit/export/public-key/release-signing/2|allow:read"
  "console|identity/group/name/governor-keyholders|allow:read"
  "console|kv/data/breakglass/lock-gates|deny:read"
  "console|sys/control-group/authorize|deny:update"
  "console|transit/sign/release-signing|deny:update"
  "console|transit/keys/release-signing/algorithm|deny:update"
  "console|identity/scim/v2/Users|deny:create"
  "console|identity/entity/name/scim-hr|deny:read"
  "console|identity/entity/id/any|deny:read"
  "scim-hr|identity/scim/v2/Users|allow:create"
  "scim-hr|identity/scim/v2/Groups/x|allow:patch"
  "scim-hr|kv/data/breakglass/lock-gates|deny:read"
  "scim-hr|sys/control-group/authorize|deny:update"
  "scim-hr|sys/policies/acl/gov-keyholder|deny:update"
)
vault_cluster
for check in "${people_checks[@]}"; do
  IFS='|' read -r who path expect <<<"$check"
  revoke=false
  case "$who" in
  console | scim-hr)
    file="$VGOV_STATE/tokens/$who"
    if [ ! -s "$file" ]; then skipped=$((skipped + 1)); continue; fi
    tok=$(cat "$file")
    ;;
  *)
    if [ ! -s "$VGOV_ROOT/.secrets/people/$who" ]; then skipped=$((skipped + 1)); continue; fi
    person_login "$who" || { fails=$((fails + 1)); checked=$((checked + 1)); continue; }
    tok=$VAULT_TOKEN
    unset VAULT_TOKEN
    revoke=true
    ;;
  esac
  caps=$(vcurl "$tok" -sS --cacert "$VAULT_CACERT" -H "X-Vault-Namespace: $ns" \
    -X POST -d "{\"paths\":[\"$path\"]}" "$VAULT_ADDR/v1/sys/capabilities-self" |
    jq -r --arg p "$path" 'if .errors then "ERROR" else ((.data // .)[$p] // [] | join(",")) end')
  [ "$revoke" = false ] || vcurl "$tok" -sS -o /dev/null --cacert "$VAULT_CACERT" -H "X-Vault-Namespace: $ns" \
    -X POST "$VAULT_ADDR/v1/auth/token/revoke-self" || true
  unset tok
  mode=${expect%%:*}
  cap=${expect#*:}
  if [ "$caps" = ERROR ]; then
    # A refused question proves nothing, also not a deny.
    printf '  \033[31mFAIL\033[0m %-17s %-5s %-6s %s (capabilities-self refused)\n' "${who:-$name}" "$mode" "$cap" "$path"
    fails=$((fails + 1))
    checked=$((checked + 1))
    continue
  fi
  has=no
  [[ ",$caps," == *",$cap,"* || ",$caps," == *",root,"* ]] && has=yes
  if { [ "$mode" = allow ] && [ "$has" = yes ]; } || { [ "$mode" = deny ] && [ "$has" = no ]; }; then
    printf '  \033[32mok\033[0m   %-17s %-5s %-6s %s\n' "$who" "$mode" "$cap" "$path"
  else
    printf '  \033[31mFAIL\033[0m %-17s %-5s %-6s %s (has: %s)\n' "$who" "$mode" "$cap" "$path" "${caps:-none}"
    fails=$((fails + 1))
  fi
  checked=$((checked + 1))
done
mkdir -p "$BUILD_DIR/gates"
jq -n --arg result "$([ "$fails" -eq 0 ] && echo pass || echo fail)" --argjson checked "$checked" \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{gate: "boundary", result: $result, checks: $checked, at: $at}' >"$BUILD_DIR/gates/boundary.json"
[ "$fails" -eq 0 ] || die "$fails boundary check(s) failed."
[ "$checked" -gt 0 ] || die "no scoped token found: run make lab"
note=""
[ "$skipped" -eq 0 ] || note=", $skipped skipped: token not issued yet"
info "Token boundary holds ($checked checks$note)"
