#!/usr/bin/env bash
# scripts/rehearsal.sh (make rehearsal, make api-test): every chapter through
# the console (https, the lab CA, signed in as rowan on the form's API), and
# every way each beat must fail, one row per case with Vault's status and
# error verbatim. A few cases have no console button and ask Vault directly
# with that identity's own token (rowan approving, the SCIM token outside
# SCIM, the console token on SCIM). Starts and ends with make stage-reset.
#
# Not rehearsed: a held request expiring. The Control Group max_ttl is 900 s
# (D10), longer than a rehearsal should wait; Vault's answer for an expired
# wrapping token is the used-token answer (R10).
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
cd "$VGOV_ROOT"
t_start=$(date +%s)
BASE="https://localhost:$(vgov_conf VGOV_PORT_WEB)"
NS=$(vgov_conf VGOV_NAMESPACE)
CODE=$(jq -r .breakglass.fields.recovery_code config/story.json)
TICKET=$(jq -r .ticket_example config/story.json)
OUT=$(mktemp)
JAR=$(mktemp)
trap 'rm -f "$OUT" "$JAR"' EXIT
pass=0
fail=0
row() { # <case> <label> <yes|no> <detail>
  if [ "$3" = yes ]; then pass=$((pass + 1)); printf '  \033[32mPASS\033[0m %-4s %-62s %s\n' "$1" "$2" "$(cut -c1-90 <<<"$4")"
  else fail=$((fail + 1)); printf '  \033[31mFAIL\033[0m %-4s %-62s %s\n' "$1" "$2" "$(cut -c1-220 <<<"$4")"; fi
}
said() { jq -r '[(.vault.status // empty | tostring), (.vault.errors[0] // .error // empty | gsub("\\s+"; " ") | .[0:110])] | join(" | ")' "$OUT" 2>/dev/null || true; }
# step <case> <label> <chapter> <step> <body> <jq test>: one console step.
step() {
  curl -sS -o "$OUT" -b "$JAR" -c "$JAR" --cacert vault-tls/ca-chain.pem -X POST -H 'content-type: application/json' \
    -d "$5" "$BASE/api/chapters/$3/$4" >/dev/null || true
  if jq -e "$6" "$OUT" >/dev/null 2>&1; then row "$1" "$2" yes "$(said)"; else row "$1" "$2" no "$(said)"; fi
}
# direct <case> <label> <token> <METHOD> <path in governor> <body> <want status> [error regex]
direct() {
  local code err
  vault_cluster
  code=$(curl -sS -o "$OUT" -w '%{http_code}' --cacert "$VAULT_CACERT" -X "$4" -H "X-Vault-Token: $3" \
    ${6:+-H 'content-type: application/json' -d "$6"} "$VAULT_ADDR/v1/$NS/$5" || echo 000)
  err=$(jq -r '.errors[0] // .detail // empty' "$OUT" 2>/dev/null | tr '\n\t' '  ' | tr -s ' ' || true)
  if [ "$code" = "$7" ] && [[ "$err" =~ ${8:-.*} ]]; then row "$1" "$2" yes "$code | $err"; else row "$1" "$2" no "$code | $err"; fi
}

echo "rehearsal: a fresh stage"
CONFIRM=yes ./scripts/stage-reset.sh >/dev/null
health=$(curl -sf --cacert vault-tls/ca-chain.pem "$BASE/api/health" || echo '{}')
if jq -e '.ok' <<<"$health" >/dev/null; then row R0 "the console answers; three nodes; console token" yes "ok"; else row R0 "the console answers" no "$health"; fi
jq -n --rawfile p .secrets/people/rowan '{username: "rowan", password: ($p | rtrimstr("\n"))}' |
  curl -sS -o "$OUT" -c "$JAR" --cacert vault-tls/ca-chain.pem -H 'content-type: application/json' --data @- "$BASE/api/session" >/dev/null
if jq -e '.signedIn == "rowan"' "$OUT" >/dev/null; then row R1 "rowan signs in on the console" yes ""; else row R1 "rowan signs in" no "$(said)"; fi
code=$(curl -s -o /dev/null -w '%{http_code}' --cacert vault-tls/ca-chain.pem -H 'content-type: application/json' -d '{"username":"ines","password":"x"}' "$BASE/api/session")
row R2 "a keyholder cannot sign in to the console" "$([ "$code" = 403 ] && echo yes || echo no)" "HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" --cacert vault-tls/ca-chain.pem -H 'content-type: application/json' -H 'origin: https://localhost:13701' -d '{}' "$BASE/api/chapters/second-key/read")
row R3 "a write from another origin is refused" "$([ "$code" = 403 ] && echo yes || echo no)" "HTTP $code"
ROWAN=$(curl -sf -b "$JAR" --cacert vault-tls/ca-chain.pem "$BASE/api/me" | jq -r .entity_id)

echo "chapter I: The Second Key"
step R4 "no ticket: refused by the EGP" second-key read '{}' '.vault.status == 403 and (.vault.errors[0] | test("gov-breakglass-ticket"))'
step R5 "a ticket of the wrong shape (INC-1): refused by the EGP" second-key read '{"ticket":"INC-1"}' '.vault.status == 403 and (.vault.errors[0] | test("egp"))'
step R6 "a query smuggled in the ticket: refused by the API's shape check" second-key read '{"ticket":"HAR-0417&x=1"}' '.ok == false and (.error | test("ticket"))'
step R7 "with $TICKET: held, a wrapping accessor, no value" second-key read "{\"ticket\":\"$TICKET\"}" '.held and .vault.wrap_info.accessor != null and (.vault.data == null)'
step R8 "ines approves: recorded, not yet approved" second-key approve '{"as":"ines"}' '.vault.status == 200 and .request.approved == false and (.request.by | map(.name) | index("ines") != null)'
step R9 "rowan opens after one approval: refused" second-key open '{}' '.vault.status == 400 and (.vault.errors[0] | test("further authorization"))'
step R10 "ines approves again: still one eligible approval" second-key approve '{"as":"ines"}' '.request.approved == false'
step R11 "jonas (the button, not the group): listed, not counted" second-key approve '{"as":"jonas"}' '.request.approved == false and (.request.by[] | select(.name == "jonas") | .member == false)'
ACC=$(jq -r '.request.accessor' "$OUT")
vault_cluster
person_login rowan
direct R12 "rowan approves his own request (no authorize policy)" "$VAULT_TOKEN" POST sys/control-group/authorize "{\"accessor\":\"$ACC\"}" 403 "permission denied"
unset VAULT_TOKEN
step R13 "kofi approves: Vault says approved" second-key approve '{"as":"kofi"}' '.request.approved == true'
step R14 "rowan opens it: the synthetic recovery code, once" second-key open '{}' ".vault.status == 200 and .vault.data.data.recovery_code == \"$CODE\""
step R15 "rowan opens it again: the wrapping token is used" second-key open '{}' '.vault.status == 400 and (.vault.errors[0] | test("wrapping token is not valid"))'

echo "chapter II: The Algorithm's Second Key"
step R16 "the v1 baseline verifies" algorithm baseline '{}' '.vault.data.valid == true'
step R17 "ecdsa-p384: refused by the EGP" algorithm request '{"type":"ecdsa-p384"}' '.vault.status == 403 and (.vault.errors[0] | test("gov-algorithm-target"))'
step R18 "aes256-gcm96 (encryption): refused by the EGP first" algorithm request '{"type":"aes256-gcm96"}' '.vault.status == 403'
step R19 "ml-dsa 44 (not the approved set): refused by the EGP" algorithm request '{"type":"ml-dsa","parameter_set":"44"}' '.vault.status == 403'
step R20 "ml-dsa 65: held; the key stays at v1" algorithm request '{"type":"ml-dsa","parameter_set":"65"}' '.held and .key.latest_version == 1'
step R21 "one approval: still held, still v1" algorithm approve '{"as":"ines"}' '.request.approved == false'
step R22 "complete with one approval: refused" algorithm open '{}' '.vault.status == 400'
step R23 "the key after the refusal" algorithm key '{}' '.key.latest_version == 1'
step R24 "mara approves: approved" algorithm approve '{"as":"mara"}' '.request.approved == true'
step R25 "rowan completes the change" algorithm open '{}' '.vault.status == 200'
step R26 "the key is v2, ml-dsa" algorithm key '{}' '.key.latest_version == 2 and .key.latest_version_type == "ml-dsa"'
step R27 "complete it again: refused, applied once" algorithm open '{}' '.vault.status == 400'
step R28 "sign the manifest again: vault:v2" algorithm sign '{}' '.version == 2'
step R29 "Vault and the lab verifier: v1 ECDSA and v2 ML-DSA-65 valid" algorithm verify '{}' '[.results[] | .vault_valid and .lab.valid] == [true, true] and ([.results[].lab.keyType] == ["ec", "ml-dsa-65"])'

echo "chapter III: The Keyholder Who Left (removed from the group)"
step R30 "the roster: three active members" left roster '{}' '[.roster[] | .active and .member] == [true, true, true]'
step R31 "a request waits" left request '{}' '.held'
step R32 "ines approves" left approve '{"as":"ines"}' '.request.approved == false'
step R33 "mara signs in while still a keyholder" left leaver-login '{}' '.vault.status == 200'
step R34 "HR removes mara from governor-keyholders" left offboard '{"mode":"group"}' '.leaver.member == false and .leaver.active == true'
step R35 "her old token still works; a new login works" left leaver-check '{}' '(.checks[0].works and .checks[1].works)'
step R36 "her approvals, pending and new: accepted, never counted" left leaver-check '{}' '[.checks[2:][] | .request.approved] == [false, false]'
step R37 "kofi completes the council" left approve '{"as":"kofi"}' '.request.approved == true'
step R38 "rowan opens it" left open '{}' '.vault.status == 200'
step R39 "HR reconciles: mara back in the group" left reconcile '{}' '.changes == ["add mara to governor-keyholders"]'

echo "chapter III: The Keyholder Who Left (account deactivated)"
step R40 "a request waits; ines approves" left request '{}' '.held'
step R41 "ines approves" left approve '{"as":"ines"}' '.request.approved == false'
step R42 "mara signs in while still active" left leaver-login '{}' '.vault.status == 200'
step R43 "HR sets mara active=false" left offboard '{"mode":"inactive"}' '.leaver.active == false'
step R44 "her old token, a new login and her approval: all refused (403)" left leaver-check '{}' '[.checks[] | .works] == [false, false, false, false] and ([.checks[] | .vault.status] | unique == [403])'
step R45 "HR reconciles: mara active again" left reconcile '{}' '.changes == ["activate mara"]'

echo "the SCIM client's boundaries"
direct R46 "the SCIM token outside SCIM (the break-glass value)" "$(cat "$VGOV_STATE/tokens/scim-hr")" GET kv/data/breakglass/lock-gates "" 403 "permission denied"
direct R47 "the SCIM token on an entity it did not create (rowan)" "$(cat "$VGOV_STATE/tokens/scim-hr")" GET "identity/scim/v2/Users/$ROWAN" "" 404
direct R48 "the console token on SCIM: not a SCIM client" "$(cat "$VGOV_STATE/tokens/console")" GET identity/scim/v2/Users "" 403
direct R49 "the console token cannot read the value" "$(cat "$VGOV_STATE/tokens/console")" GET kv/data/breakglass/lock-gates "" 403

curl -s -o /dev/null -b "$JAR" --cacert vault-tls/ca-chain.pem -X POST "$BASE/api/session/logout" || true
echo "rehearsal: back to a fresh stage"
CONFIRM=yes ./scripts/stage-reset.sh >/dev/null
mkdir -p "$BUILD_DIR/gates"
jq -n --argjson pass "$pass" --argjson fail "$fail" --argjson s "$(($(date +%s) - t_start))" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{gate: "rehearsal", result: (if $fail == 0 then "pass" else "fail" end), pass: $pass, fail: $fail, seconds: $s, at: $at}' >"$BUILD_DIR/gates/rehearsal.json"
echo "rehearsal: $pass passed, $fail failed in $(($(date +%s) - t_start))s"
[ "$fail" -eq 0 ]
