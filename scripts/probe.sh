#!/usr/bin/env bash
# scripts/probe.sh (make probe): prove every chapter's mechanic against the
# live 2.2.1 cluster before anything is built on it (prompt 03, questions Q1
# to Q8 of prompts/00_brief.md). Scratch only: one namespace probe-<epoch>
# with its own userpass, kv, transit, policies, EGPs, SCIM client and people,
# plus a scratch audit device in the root namespace. Created at the start,
# removed at the end, also on failure (KEEP=1 keeps the namespace). Runs on
# the 4h probe token that bootstrap minted (vault/policies/probe.hcl): never a
# root token, and the people are ordinary userpass logins, so Sentinel runs.
# Writes docs/capabilities.md and .build/probe/results.json. Never prints a
# token or a password.
set -euo pipefail
umask 077
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
# shellcheck source=scripts/probe-lib.sh
source "$VGOV_ROOT/scripts/probe-lib.sh"
cd "$VGOV_ROOT"

OUT="$VGOV_ROOT/docs/capabilities.md"
ROWS=$(mktemp)
PW_DIR=$(mktemp -d)
NOTES=$(mktemp)
WORK=$(mktemp -d)
pass=0
fail=0
T=$(cat "$VGOV_STATE/tokens/probe" 2>/dev/null) || die "probe: no probe token (.secrets/vault/tokens/probe); bootstrap mints one, make root-regen re-mints"
vault_active
api "$T" GET auth/token/lookup-self
[ "$ST" = 200 ] || die "probe: the probe token is not accepted (expired after 4h?): HTTP $ST $ERR"
note() { printf -- '- %s\n' "$*" >>"$NOTES"; }
NS="probe-$(date +%s)"
declare -A TOK ENT SID

# scim <METHOD> <path under identity/scim/v2> [body]: as the SCIM client, with
# SCIM's own content type. Sets ST, BODY, ERR like api.
scim() {
  local out
  out=$(mktemp)
  ST=$(curl -sS -o "$out" -w '%{http_code}' --cacert "$VAULT_CACERT" -X "$1" \
    -H "X-Vault-Token: $SCIM_TOKEN" -H 'Content-Type: application/scim+json' \
    ${3:+-d "$3"} "$VAULT_ADDR/v1/$NS/identity/scim/v2/$2" || echo 000)
  BODY=$(cat "$out")
  rm -f "$out"
  ERR=$(jq -r '(.errors[0] // .detail // empty) | tostring' <<<"$BODY" 2>/dev/null | tr '\n\t' '  ' | sed 's/ *$//' || true)
}

# login <user>: sets TOK[user] and ENT[user] (password from PW_DIR).
login() {
  api - POST "$NS/auth/userpass/login/$1" "$(jq -n --rawfile p "$PW_DIR/$1" '{password: $p}')"
  TOK[$1]=$(jq -r '.auth.client_token // empty' <<<"$BODY")
  ENT[$1]=$(jq -r '.auth.entity_id // empty' <<<"$BODY")
}

# request <who> [query]: a held read of the break-glass value; sets W (the
# wrapping token) and ACC (its accessor). Not in a subshell: callers need both.
W=""
ACC=""
request() {
  api "${TOK[$1]}" GET "$NS/kv/data/breakglass/lock-gates${2:-}"
  ACC=$(jq -r '.wrap_info.accessor // empty' <<<"$BODY")
  W=$(jq -r '.wrap_info.token // empty' <<<"$BODY")
}
approve() { api "${TOK[$1]}" POST "$NS/sys/control-group/authorize" "$(jq -n --arg a "$2" '{accessor: $a}')"; }
status_of() { api "${TOK[rowan]}" POST "$NS/sys/control-group/request" "$(jq -n --arg a "$1" '{accessor: $a}')"; }
egp() { # <name> <paths json> <sentinel>
  api "$T" PUT "$NS/sys/policies/egp/$1" "$(jq -n --arg p "$3" --argjson paths "$2" '{policy: $p, paths: $paths, enforcement_level: "hard-mandatory"}')"
}

cleanup() {
  set +e
  if [ "${KEEP:-0}" = 1 ]; then
    echo "probe: KEEP=1, namespace $NS kept"
  else
    api "$T" DELETE "$NS/identity/scim/client/hr?delete-linked-resources=true"
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      api "$T" GET "$NS/identity/scim/client/hr"
      [ "$ST" = 404 ] && break
      sleep 1
    done
    api "$T" DELETE "sys/namespaces/$NS"
  fi
  api "$T" DELETE sys/audit/probe-file
  podman rm -f vgov-probe_verify >/dev/null 2>&1
  set -e
}
trap 'cleanup; rm -rf "$ROWS" "$NOTES" "$PW_DIR" "$WORK"' EXIT

started=$(date +%s)
echo "probe: scratch namespace $NS"
api "$T" POST "sys/namespaces/$NS" '{}'
[ "$ST" = 200 ] || die "probe: could not create the scratch namespace: HTTP $ST $ERR"
api "$T" PUT sys/audit/probe-file '{"type":"file","options":{"file_path":"/vault/audit/probe.log","mode":"0600"}}'
[ "$ST" = 204 ] || die "probe: could not enable the scratch audit device: HTTP $ST $ERR"

# ── Q1: the licence ───────────────────────────────────────────────────────────
api "$T" GET sys/license/status
features=$(jq -r '.data.autoloaded.features // .data.features // [] | join(", ")' <<<"$BODY")
note "Licence features: $features."
for f in Namespaces "Control Groups" Sentinel; do
  if jq -e --arg f "$f" '(.data.autoloaded.features // .data.features // []) | index($f)' <<<"$BODY" >/dev/null; then
    row P1 all "sys/license/status has $f" present "HTTP 200" yes
  else row P1 all "sys/license/status has $f" present "missing" no; fi
done
scim_feature=$(jq -r '(.data.autoloaded.features // .data.features // []) | map(select(test("SCIM|Identity"; "i"))) | join(", ")' <<<"$BODY")
row P1 III "sys/license/status names SCIM" "recorded (docs give no feature name)" "${scim_feature:-no feature named SCIM}" yes

# ── Structure in the scratch namespace (as Terraform will build it) ───────────
api "$T" POST "$NS/sys/auth/userpass" '{"type":"userpass"}'
api "$T" GET "$NS/sys/auth"
UP_ACC=$(jq -r '.data["userpass/"].accessor // .["userpass/"].accessor' <<<"$BODY")
TOKEN_ACC=$(jq -r '.data["token/"].accessor // .["token/"].accessor' <<<"$BODY")
api "$T" POST "$NS/sys/mounts/kv" '{"type":"kv","options":{"version":"2"}}'
api "$T" POST "$NS/sys/mounts/transit" '{"type":"transit"}'
api "$T" POST "$NS/kv/data/breakglass/lock-gates" '{"data":{"recovery_code":"PROBE-ONLY-0000"}}'
row P2 I "write the scratch break-glass value (probe token)" "200" "HTTP $ST${ERR:+: $ERR}" "$([ "$ST" = 200 ] && echo yes || echo no)"
api "$T" POST "$NS/transit/keys/sig" '{"type":"ecdsa-p256"}'

read -r -d '' REQ_POLICY <<'HCL' || true
path "kv/data/breakglass/*" {
  capabilities = ["read"]
  control_group = {
    factor "keyholders" {
      identity {
        group_names = ["probe-keyholders"]
        approvals   = 2
      }
    }
  }
}
path "transit/keys/sig/algorithm" {
  capabilities = ["update"]
  control_group = {
    factor "keyholders" {
      identity {
        group_names = ["probe-keyholders"]
        approvals   = 2
      }
    }
  }
}
path "transit/keys/sig" { capabilities = ["read"] }
path "transit/sign/sig" { capabilities = ["update"] }
path "transit/verify/sig" { capabilities = ["update"] }
path "sys/control-group/request" { capabilities = ["update"] }
HCL
api "$T" PUT "$NS/sys/policies/acl/p-requestor" "$(jq -n --arg p "$REQ_POLICY" '{policy: $p}')"
row P2 I "ACL policy with control_group factor (group_names) in a namespace" "204" "HTTP $ST${ERR:+: $ERR}" "$([ "$ST" = 204 ] && echo yes || echo no)"
api "$T" PUT "$NS/sys/policies/acl/p-keyholder" "$(jq -n '{policy: "
path \"sys/control-group/authorize\" { capabilities = [\"update\"] }
path \"sys/control-group/request\" { capabilities = [\"update\"] }
"}')"
api "$T" PUT "$NS/sys/policies/acl/p-scim" "$(jq -n '{policy: "
path \"identity/scim/v2/Users\" { capabilities = [\"create\", \"read\", \"update\", \"patch\", \"delete\", \"list\"] }
path \"identity/scim/v2/Users/*\" { capabilities = [\"create\", \"read\", \"update\", \"patch\", \"delete\", \"list\"] }
path \"identity/scim/v2/Groups\" { capabilities = [\"create\", \"read\", \"update\", \"patch\", \"delete\", \"list\"] }
path \"identity/scim/v2/Groups/*\" { capabilities = [\"create\", \"read\", \"update\", \"patch\", \"delete\", \"list\"] }
path \"identity/scim/v2/ResourceTypes/*\" { capabilities = [\"read\"] }
path \"identity/scim/v2/Schemas/*\" { capabilities = [\"read\"] }
path \"identity/scim/v2/ServiceProviderConfig\" { capabilities = [\"read\"] }
"}')"

for u in rowan ines kofi mara jonas; do openssl rand -hex 16 | tr -d '\n' >"$PW_DIR/$u"; done
for u in rowan jonas; do
  pol=p-keyholder
  [ "$u" = rowan ] && pol=p-requestor
  api "$T" POST "$NS/auth/userpass/users/$u" "$(jq -n --rawfile p "$PW_DIR/$u" --arg pol "$pol" '{password: $p, token_policies: [$pol]}')"
done
for u in ines kofi mara; do
  api "$T" POST "$NS/auth/userpass/users/$u" "$(jq -n --rawfile p "$PW_DIR/$u" '{password: $p, token_policies: ["p-keyholder"]}')"
done

# ── Q6: the SCIM client (as Terraform + Ansible will build it) ────────────────
api "$T" POST "$NS/identity/entity" '{"name":"scim-hr"}'
SCIM_ENT=$(jq -r '.data.id // empty' <<<"$BODY")
api "$T" POST "$NS/identity/entity-alias" "$(jq -n --arg c "$SCIM_ENT" --arg m "$TOKEN_ACC" '{name: "scim-hr", canonical_id: $c, mount_accessor: $m}')"
row P3 III "entity-alias on the namespace's token mount" "200" "HTTP $ST${ERR:+: $ERR}" "$([[ "$ST" =~ ^20 ]] && echo yes || echo no)"
api "$T" POST "$NS/auth/token/roles/scim-hr" '{"allowed_entity_aliases":["scim-hr"],"orphan":true,"token_no_default_policy":true,"allowed_policies":["p-scim"]}'
row P3 III "token role scim-hr (allowed_entity_aliases, orphan)" "204" "HTTP $ST${ERR:+: $ERR}" "$([[ "$ST" =~ ^20 ]] && echo yes || echo no)"
api "$T" POST "$NS/identity/scim/client/hr" "$(jq -n --arg e "$SCIM_ENT" --arg m "$UP_ACC" '{access_grant_principal: $e, alias_mount_accessor: $m}')"
row P3 III "identity/scim/client/hr (alias_mount_accessor = userpass)" "200 or 204" "HTTP $ST${ERR:+: $ERR}" "$([[ "$ST" =~ ^20 ]] && echo yes || echo no)"
api "$T" GET "$NS/identity/scim/client/hr"
note "SCIM client config as read back: $(jq -c '.data | del(.access_grant_principal)' <<<"$BODY" 2>/dev/null)"
api "$T" POST "$NS/auth/token/create/scim-hr" '{"entity_alias":"scim-hr","policies":["p-scim"],"type":"scim","renewable":false,"ttl":"1h"}'
SCIM_TOKEN=$(jq -r '.auth.client_token // empty' <<<"$BODY")
expect P3 III "auth/token/create/scim-hr type=scim, entity_alias" "a SCIM token" 200 '.auth.client_token != null'
note "SCIM token: type $(jq -r '.auth.token_type' <<<"$BODY"), renewable $(jq -r '.auth.renewable' <<<"$BODY"), orphan $(jq -r '.auth.orphan' <<<"$BODY"), TTL $(jq -r '.auth.lease_duration' <<<"$BODY") s, entity $([ "$(jq -r '.auth.entity_id' <<<"$BODY")" = "$SCIM_ENT" ] && echo "= scim-hr" || echo "NOT scim-hr")."
[ -n "$SCIM_TOKEN" ] || die "probe: no SCIM token: HTTP $ST $ERR (the rest depends on it)"
scim GET ServiceProviderConfig
expect P3 III "SCIM ServiceProviderConfig" 200 200
for u in ines kofi mara; do
  scim POST Users "$(jq -n --arg u "$u" '{schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: $u, active: true}')"
  SID[$u]=$(jq -r '.id // empty' <<<"$BODY")
  expect P4 III "SCIM POST /Users $u" "201, id = entity id" "201|200" '.id != null'
done
scim POST Groups "$(jq -n --arg a "${SID[ines]}" --arg b "${SID[kofi]}" --arg c "${SID[mara]}" '{schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"], displayName: "probe-keyholders", members: [{value: $a}, {value: $b}, {value: $c}]}')"
GID=$(jq -r '.id // empty' <<<"$BODY")
expect P4 III "SCIM POST /Groups probe-keyholders (3 members)" 201 "201|200" '.id != null'
scim POST Users '{"schemas":["urn:ietf:params:scim:schemas:core:2.0:User"],"userName":"bulk-a"}'
note "Raw SCIM create of a user without active: HTTP $ST."
api "$SCIM_TOKEN" GET "$NS/kv/data/breakglass/lock-gates"
expect P5 III "SCIM token outside SCIM (kv read)" "refused" "403|400"
api "$T" GET "$NS/identity/group/id/$GID"
note "SCIM group as Vault reads it: type $(jq -r '.data.type' <<<"$BODY"), $(jq -r '.data.member_entity_ids | length' <<<"$BODY") members, policies $(jq -c '.data.policies' <<<"$BODY")."

for u in rowan ines kofi mara jonas; do login "$u"; done
for u in ines kofi mara; do
  if [ "${ENT[$u]}" = "${SID[$u]}" ]; then
    row P6 III "userpass login of $u resolves to the SCIM entity" "same entity id" "same entity" yes
  else row P6 III "userpass login of $u resolves to the SCIM entity" "same entity id" "login ${ENT[$u]:0:8}, SCIM ${SID[$u]:0:8}" no; fi
done
scim GET "Users/${ENT[rowan]}"
expect P5 III "SCIM GET of an entity the client did not create (rowan)" "not visible" "404|403"

# ── Q2, Q7: the Control Group in a namespace ──────────────────────────────────
request rowan
expect P7 I "rowan reads kv/data/breakglass/lock-gates" "held: wrap_info, no data" 200 '.wrap_info.accessor != null and (.data == null)'
status_of "$ACC"
expect P7 I "sys/control-group/request as rowan" "approved=false" 200 '.data.approved == false'
api "${TOK[rowan]}" POST "$NS/sys/control-group/authorize" "$(jq -n --arg a "$ACC" '{accessor: $a}')"
expect P8 I "rowan approves own request (not in group, no policy)" "refused" "403"
approve ines "$ACC"
expect P8 I "ines approves" "accepted, approved=false" 200 '.data.approved == false'
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$W" '{token: $t}')"
expect P8 I "rowan unwraps after one approval" "refused" "400|403"
approve ines "$ACC"
expect P8 I "ines approves a second time" "still approved=false" 200 '.data.approved == false'
approve jonas "$ACC"
expect P8 I "jonas (authorize policy, not in group) approves" "refused or not counted" "200|400|403" '(.data.approved // false) == false'
note "jonas's approval answer: HTTP $ST${ERR:+: $ERR} $(jq -c '.data // empty' <<<"$BODY" 2>/dev/null)."
status_of "$ACC"
note "After ines x2 and jonas: $(jq -c '.data | {approved, authorizations: [.authorizations[]?.entity_name]}' <<<"$BODY" 2>/dev/null)."
approve kofi "$ACC"
expect P9 I "kofi approves" "approved=true" 200 '.data.approved == true'
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$W" '{token: $t}')"
expect P9 I "rowan unwraps after two approvals" "the value" 200 '.data.data.recovery_code == "PROBE-ONLY-0000"'
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$W" '{token: $t}')"
expect P9 I "rowan unwraps again" "refused" "400"
api "$T" GET "$NS/sys/config/control-group"
row P10 I "GET <ns>/sys/config/control-group" "recorded" "HTTP $ST${ERR:+: $ERR}" yes
api "$T" GET sys/config/control-group
row P10 I "GET sys/config/control-group (root)" "recorded" "HTTP $ST${ERR:+: $ERR} $(jq -c '.data // empty' <<<"$BODY")" yes
ROOT_CG=$ST
api "$T" PUT "$NS/sys/config/control-group" '{"max_ttl":"15m"}'
row P10 I "PUT <ns>/sys/config/control-group max_ttl=15m" "recorded (root only?)" "HTTP $ST${ERR:+: $ERR}" yes
api "$T" PUT sys/config/control-group '{"max_ttl":"15m"}'
row P10 I "PUT sys/config/control-group max_ttl=15m (root)" "accepted" "HTTP $ST${ERR:+: $ERR}" "$([[ "$ST" =~ ^20 ]] && echo yes || echo no)"
api "$T" GET sys/config/control-group
note "Root Control Group config after the write: $(jq -c '.data // empty' <<<"$BODY")."
# Which config applies to a request in the namespace? Distinct TTLs, then the
# held request's wrap_info.ttl answers.
api "$T" PUT "$NS/sys/config/control-group" '{"max_ttl":"7m"}'
api "$T" PUT sys/config/control-group '{"max_ttl":"11m"}'
request rowan
wttl=$(jq -r '.wrap_info.ttl // empty' <<<"$BODY")
row P10 I "held request's wrap_info.ttl with ns=7m, root=11m" "the config that applies" "ttl=${wttl}s ($([ "$wttl" = 420 ] && echo namespace || { [ "$wttl" = 660 ] && echo root || echo neither; }))" yes
api "$T" PUT "$NS/sys/config/control-group" '{"max_ttl":"15m"}'
if [ "$ROOT_CG" = 404 ]; then api "$T" DELETE sys/config/control-group; else api "$T" PUT sys/config/control-group '{"max_ttl":"15m"}'; fi

# ── An approval and the approver's token (found in prompt 06) ─────────────────
request rowan
RV=$ACC
login ines
approve ines "$RV"
login kofi
approve kofi "$RV"
status_of "$RV"
before=$(jq -c '[.data.authorizations[]?.entity_name] | length' <<<"$BODY")
api "${TOK[kofi]}" POST "$NS/auth/token/revoke-self"
status_of "$RV"
after=$(jq -c '{approved: .data.approved, n: ([.data.authorizations[]?.entity_name] | length)}' <<<"$BODY")
row P27 I "revoke the approver's token after two approvals" "recorded: does the approval stay?" "before $before approvals; after revoke-self of kofi's token: $after" yes
note "Revoking an approver's token: $before approvals before, $after after (an approval lives as long as the approver's token)."
login kofi

# ── Q3: the governance context reaching Sentinel on a KV v2 read ──────────────
tkt='HAR-0417'
mech=""
egp p-ticket '["kv/data/breakglass/*"]' 'main = rule { request.operation is not "read" or (request.data.ticket else "") matches "^HAR-[0-9]{4}$" }'
row P11 I "EGP on kv/data/breakglass/* (namespaced, hard-mandatory)" 204 "HTTP $ST${ERR:+: $ERR}" "$([ "$ST" = 204 ] && echo yes || echo no)"
request rowan
expect P11 I "(a) read without ?ticket" "refused by the EGP" "403"
NO_TICKET_ERR=$ERR
request rowan "?ticket=$tkt"
if [ -n "$ACC" ]; then mech=a; fi
expect P11 I "(a) read with ?ticket=$tkt (request.data)" "held (passes the EGP)" "200|403" '.wrap_info.accessor != null'
if [ -z "$mech" ]; then
  egp p-ticket '["kv/data/breakglass/*"]' 'main = rule { request.operation is not "read" or (request.headers["x-governor-ticket"] else request.headers["X-Governor-Ticket"] else "") matches "^HAR-[0-9]{4}$" }'
  api "${TOK[rowan]}" GET "$NS/kv/data/breakglass/lock-gates" "" "X-Governor-Ticket: $tkt"
  ACC=$(jq -r '.wrap_info.accessor // empty' <<<"$BODY")
  W=$(jq -r '.wrap_info.token // empty' <<<"$BODY")
  [ -n "$ACC" ] && mech=b
  expect P11 I "(b) read with header X-Governor-Ticket (request.headers)" "held" "200|403" '.wrap_info.accessor != null'
fi
if [ -z "$mech" ]; then
  egp p-ticket '["kv/data/breakglass/*"]' 'main = rule { request.operation is not "read" or (identity.entity.metadata.ticket else "") matches "^HAR-[0-9]{4}$" }'
  api "$T" POST "$NS/identity/entity/id/${ENT[rowan]}" "$(jq -n --arg t "$tkt" '{metadata: {ticket: $t}}')"
  request rowan
  [ -n "$ACC" ] && mech=d
  expect P11 I "(d) entity metadata ticket" "held" "200|403" '.wrap_info.accessor != null'
fi
note "Governance context mechanism that reaches Sentinel on a KV v2 read: ${mech:-none}. EGP refusal text: $NO_TICKET_ERR."
if [ -n "$mech" ]; then
  approve ines "$ACC"
  approve kofi "$ACC"
  expect P12 I "two approvals on the ticketed request" "approved=true" 200 '.data.approved == true'
  api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$W" '{token: $t}')"
  expect P12 I "unwrap of an approved, ticketed request (EGP on replay)" "the value" "200|400|403" '.data.data.recovery_code == "PROBE-ONLY-0000"'
  note "Unwrap with the EGP in place: HTTP $ST${ERR:+: $ERR}."
fi
egp p-ticket '["kv/data/breakglass/*"]' 'main = rule { request.operation is not "read" or (request.data.ticket else "") matches "^HAR-[0-9]{4}$" }'
api "$T" POST "$NS/kv/data/breakglass/lock-gates" '{"data":{"recovery_code":"PROBE-ONLY-0000"}}'
expect P12 I "a write (not a read) under the EGP, probe token" "allowed (the rule only governs reads)" 200

# ── Q4, Q5: the algorithm change behind the Control Group and an EGP ──────────
manifest='{"name":"probe-manifest","version":"1"}'
in64=$(b64 "$manifest")
api "${TOK[rowan]}" POST "$NS/transit/sign/sig" "$(jq -n --arg i "$in64" '{input: $i}')"
SIG1=$(jq -r '.data.signature // empty' <<<"$BODY")
expect P13 II "rowan signs the manifest with v1 (ecdsa-p256)" "vault:v1" 200 '.data.signature | startswith("vault:v1:")'
api "$T" POST "$NS/transit/keys/sig/algorithm" '{"type":"aes256-gcm96"}'
expect P13 II "algorithm change signing -> aes256-gcm96 (probe token, no EGP yet)" "refused by Vault (usage)" 400
egp p-algorithm '["transit/keys/sig/algorithm"]' 'main = rule { request.operation is not "update" or ((request.data.type else "") is "ml-dsa" and (request.data.parameter_set else "") is "65") }'
row P14 II "EGP on transit/keys/sig/algorithm" 204 "HTTP $ST${ERR:+: $ERR}" "$([ "$ST" = 204 ] && echo yes || echo no)"
api "${TOK[rowan]}" POST "$NS/transit/keys/sig/algorithm" '{"type":"ecdsa-p384"}'
expect P14 II "rowan asks for ecdsa-p384 (not the approved target)" "refused by the EGP" "403"
api "${TOK[rowan]}" POST "$NS/transit/keys/sig/algorithm" '{"type":"aes256-gcm96"}'
expect P14 II "rowan asks for aes256-gcm96" "refused by the EGP (before Vault's usage rule)" "403"
api "${TOK[rowan]}" POST "$NS/transit/keys/sig/algorithm" '{"type":"ml-dsa","parameter_set":"65"}'
AW=$(jq -r '.wrap_info.token // empty' <<<"$BODY")
AACC=$(jq -r '.wrap_info.accessor // empty' <<<"$BODY")
expect P15 II "rowan asks for ml-dsa 65" "held: wrap_info" 200 '.wrap_info.accessor != null'
api "${TOK[rowan]}" GET "$NS/transit/keys/sig"
expect P15 II "key after the request" "still v1" 200 '.data.latest_version == 1'
approve ines "$AACC"
api "${TOK[rowan]}" GET "$NS/transit/keys/sig"
expect P15 II "key after one approval" "still v1" 200 '.data.latest_version == 1'
approve kofi "$AACC"
expect P15 II "second approval" "approved=true" 200 '.data.approved == true'
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$AW" '{token: $t}')"
expect P16 II "rowan completes the held change (unwrap)" "applied" 200
note "Unwrap of the algorithm change returned: $(jq -c '.data | {latest_version, latest_version_type, type} // empty' <<<"$BODY" 2>/dev/null)."
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$AW" '{token: $t}')"
expect P16 II "complete it a second time" "refused" 400
api "${TOK[rowan]}" GET "$NS/transit/keys/sig"
expect P16 II "key after the change" "v2 ml-dsa, applied once" 200 '.data.latest_version == 2 and (.data.latest_version_type // "" | test("ml-dsa"))'
KEYS=$BODY
note "Key metadata after: type $(jq -r '.data.type' <<<"$KEYS"), latest_version_type $(jq -r '.data.latest_version_type' <<<"$KEYS"), min_decryption_version $(jq -r '.data.min_decryption_version' <<<"$KEYS"), versions: $(jq -c '.data.keys | to_entries | map({v: .key, name: .value.name, has_public_key: (.value.public_key != null and .value.public_key != "")})' <<<"$KEYS")."
api "${TOK[rowan]}" POST "$NS/transit/sign/sig" "$(jq -n --arg i "$in64" '{input: $i}')"
SIG2=$(jq -r '.data.signature // empty' <<<"$BODY")
expect P17 II "rowan signs again" "vault:v2" 200 '.data.signature | startswith("vault:v2:")'
for s in "$SIG1" "$SIG2"; do
  api "${TOK[rowan]}" POST "$NS/transit/verify/sig" "$(jq -n --arg i "$in64" --arg s "$s" '{input: $i, signature: $s}')"
  expect P17 II "Vault verifies ${s:0:8} signature" "valid" 200 '.data.valid == true'
done

# Q5: Node 24's own verifier, with only the public keys and the signatures.
api "$T" GET "$NS/transit/export/public-key/sig/2"
expect P18 II "export/public-key/sig/2 (ml-dsa, key not exportable)" "a public key" "200|400|403" '.data.keys["2"] != null'
note "export/public-key v2: HTTP $ST${ERR:+: $ERR}, starts $(jq -r '.data.keys["2"] // empty' <<<"$BODY" | head -c 30), length $(jq -r '.data.keys["2"] // empty' <<<"$BODY" | wc -c | tr -d ' ')."
PUB2=$(jq -r '.data.keys["2"] // empty' <<<"$BODY")
api "$T" GET "$NS/transit/export/public-key/sig/1"
note "export/public-key v1: HTTP $ST, starts $(jq -r '.data.keys["1"] // empty' <<<"$BODY" | head -c 30)."
printf '%s' "$manifest" >"$WORK/manifest"
jq -r '.data.keys["1"].public_key' <<<"$KEYS" >"$WORK/pub1"
printf '%s' "${PUB2:-$(jq -r '.data.keys["2"].public_key' <<<"$KEYS")}" >"$WORK/pub2"
printf '%s' "${SIG1#vault:v1:}" >"$WORK/sig1"
printf '%s' "${SIG2#vault:v2:}" >"$WORK/sig2"
cat >"$WORK/verify.mjs" <<'JS'
import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
const r = (f) => readFileSync(`/w/${f}`, "utf8").trim();
const data = Buffer.from(r("manifest"));
const out = { node: process.version };
for (const v of ["1", "2"]) {
  const pub = r(`pub${v}`);
  const sig = Buffer.from(r(`sig${v}`), "base64");
  try {
    let key;
    const raw = pub.startsWith("-----BEGIN") ? null : Buffer.from(pub, "base64");
    if (!raw) key = createPublicKey(pub);
    // Vault exports an ML-DSA-65 key as 1952 raw bytes: wrap them in an SPKI
    // header (OID 2.16.840.1.101.3.4.3.18) so node:crypto can import them.
    else if (raw.length === 1952) key = createPublicKey({ key: Buffer.concat([Buffer.from("308207b2300b0609608648016503040312038207a100", "hex"), raw]), format: "der", type: "spki" });
    else key = createPublicKey({ key: raw, format: "der", type: "spki" });
    const algo = key.asymmetricKeyType;
    const ok = verify(algo === "ec" ? "sha256" : null, data, key, sig);
    out[`v${v}`] = { keyType: algo, format: raw ? `raw ${raw.length} bytes` : "pem", sigBytes: sig.length, valid: ok };
  } catch (e) {
    out[`v${v}`] = { error: String(e.message).slice(0, 200), pubStart: pub.slice(0, 30), sigBytes: sig.length };
  }
}
console.log(JSON.stringify(out));
JS
chmod -R a+rX "$WORK"
vres=$(podman run --rm --name vgov-probe_verify --network none -v "$WORK:/w:ro" "$(vgov_conf NODE_IMAGE)" node /w/verify.mjs 2>&1 | tail -1 || true)
note "Node verifier (node:24-alpine, public keys from GET transit/keys/sig): $vres"
row P18 II "Node verifies v1 (ECDSA P-256, public key from GET keys)" "valid" "$(jq -c '.v1' <<<"$vres" 2>/dev/null || echo "$vres")" "$(jq -e '.v1.valid == true' <<<"$vres" >/dev/null 2>&1 && echo yes || echo no)"
row P18 II "Node verifies v2 (ML-DSA-65, exported raw key in SPKI)" "recorded: the compatibility result" "$(jq -c '.v2' <<<"$vres" 2>/dev/null || echo "$vres")" yes

# ── Q6: offboarding while a request waits ─────────────────────────────────────
# Case A: removed from the group. Mara approved R0 before; R1 has ines only.
request rowan "?ticket=$tkt"
W0=$W
A0=$ACC
approve mara "$A0"
expect P19 III "mara approves R0 (before leaving)" "accepted" 200
request rowan "?ticket=$tkt"
W1=$W
A1=$ACC
approve ines "$A1"
OLD_MARA=${TOK[mara]}
patch_ok=""
for body in \
  "$(jq -n --arg m "${SID[mara]}" '{schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{op: "remove", path: ("members[value eq \"" + $m + "\"]")}]}')" \
  "$(jq -n --arg m "${SID[mara]}" '{schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{op: "remove", path: "members", value: [{value: $m}]}]}')"; do
  scim PATCH "Groups/$GID" "$body"
  if [[ "$ST" =~ ^20 ]]; then patch_ok=$(jq -r '.Operations[0].path' <<<"$body"); break; fi
  note "Group PATCH form refused: $(jq -r '.Operations[0].path' <<<"$body") -> HTTP $ST $ERR"
done
row P20 III "SCIM PATCH group: remove mara" "2xx" "HTTP $ST (form: ${patch_ok:-none})" "$([ -n "$patch_ok" ] && echo yes || echo no)"
api "$T" GET "$NS/identity/group/id/$GID"
expect P20 III "Vault's group after the PATCH" "2 members" 200 '.data.member_entity_ids | length == 2'
api "$OLD_MARA" GET "$NS/auth/token/lookup-self"
expect P21 III "A(a) mara's old token, lookup-self" "recorded" "200|403"
note "A(a) old token after group removal: HTTP $ST${ERR:+: $ERR}."
TOK[mara]=$OLD_MARA
approve mara "$A1"
row P21 III "A(c) mara (old token) approves the pending R1" "recorded" "HTTP $ST${ERR:+: $ERR} approved=$(jq -r '.data.approved // "n/a"' <<<"$BODY")" yes
status_of "$A1"
note "R1 after mara's attempt: $(jq -c '.data | {approved, by: [.authorizations[]?.entity_name]}' <<<"$BODY" 2>/dev/null)."
A1_APPROVED=$(jq -r '.data.approved' <<<"$BODY")
row P21 III "R1 approved after ines + removed mara?" "false (mara no longer counts)" "approved=$A1_APPROVED" "$([ "$A1_APPROVED" = false ] && echo yes || echo no)"
login mara
row P21 III "A(b) mara logs in again (still active)" "recorded" "$([ -n "${TOK[mara]}" ] && echo "logged in" || echo "HTTP $ST $ERR")" yes
request rowan "?ticket=$tkt"
A2=$ACC
approve mara "$A2"
row P21 III "A(d) mara approves a new request R2" "recorded" "HTTP $ST${ERR:+: $ERR} approved=$(jq -r '.data.approved // "n/a"' <<<"$BODY")" yes
status_of "$A2"
note "R2 after mara (not in group): $(jq -c '.data | {approved, by: [.authorizations[]?.entity_name]}' <<<"$BODY" 2>/dev/null)."
approve kofi "$A0"
row P22 III "R0: mara approved before leaving, then kofi" "recorded: does the earlier approval still count?" "approved=$(jq -r '.data.approved // "n/a"' <<<"$BODY")" yes
approve kofi "$A1"
expect P22 III "R1: kofi approves (ines + kofi)" "approved=true" 200 '.data.approved == true'
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$W1" '{token: $t}')"
expect P22 III "rowan opens R1" "the value" 200 '.data.data.recovery_code == "PROBE-ONLY-0000"'
api "${TOK[rowan]}" POST "$NS/sys/wrapping/unwrap" "$(jq -n --arg t "$W0" '{token: $t}')"
note "R0 unwrap (mara before leaving + kofi): HTTP $ST${ERR:+: $ERR}."

# Case B: active=false. Mara back in the group first, with a fresh token.
scim PATCH "Groups/$GID" "$(jq -n --arg m "${SID[mara]}" '{schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{op: "add", path: "members", value: [{value: $m}]}]}')"
expect P23 III "SCIM PATCH group: add mara back" "2xx" "200|204"
login mara
OLD_MARA=${TOK[mara]}
request rowan "?ticket=$tkt"
A3=$ACC
approve ines "$A3"
scim PATCH "Users/${SID[mara]}" '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"replace","path":"active","value":false}]}'
expect P23 III "SCIM PATCH user mara active=false" "2xx" "200|204"
api "$T" GET "$NS/identity/entity/id/${SID[mara]}"
note "Mara's entity after active=false: disabled=$(jq -r '.data.disabled' <<<"$BODY"), still in group: $(api "$T" GET "$NS/identity/group/id/$GID"; jq -r --arg m "${SID[mara]}" '.data.member_entity_ids | index($m) != null' <<<"$BODY")."
api "$OLD_MARA" GET "$NS/auth/token/lookup-self"
row P24 III "B(a) mara's old token after active=false" "recorded" "HTTP $ST${ERR:+: $ERR}" yes
TOK[mara]=$OLD_MARA
approve mara "$A3"
row P24 III "B(c) mara (old token) approves the pending R3" "recorded" "HTTP $ST${ERR:+: $ERR} approved=$(jq -r '.data.approved // "n/a"' <<<"$BODY")" yes
login mara
row P24 III "B(b) mara logs in after active=false" "recorded" "$([ -n "${TOK[mara]}" ] && echo "logged in" || echo "HTTP $ST $ERR")" yes
TOK[mara]=$OLD_MARA
request rowan "?ticket=$tkt"
A4=$ACC
approve mara "$A4"
row P24 III "B(d) mara (old token) approves a new request R4" "recorded" "HTTP $ST${ERR:+: $ERR} approved=$(jq -r '.data.approved // "n/a"' <<<"$BODY")" yes
status_of "$A3"
note "R3 after mara (disabled): $(jq -c '.data | {approved, by: [.authorizations[]?.entity_name]}' <<<"$BODY" 2>/dev/null)."
scim PATCH "Users/${SID[mara]}" '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"replace","path":"active","value":true}]}'
expect P25 III "SCIM PATCH user mara active=true again" "2xx" "200|204"
scim PATCH "Users/${SID[mara]}" '{"schemas":["urn:ietf:params:scim:api:messages:2.0:PatchOp"],"Operations":[{"op":"replace","path":"userName","value":"mara2"}]}'
row P25 III "SCIM PATCH user replace userName" "recorded (docs: only active)" "HTTP $ST${ERR:+: $ERR}" yes
scim GET "Users/${SID[mara]}"
note "After the userName PATCH, SCIM reads userName=$(jq -r '.userName' <<<"$BODY")."
api "$T" POST "$NS/identity/group/id/$GID" '{"member_entity_ids":[]}'
expect P25 III "admin writes members of a SCIM group (identity API)" "refused (SCIM owns it)" "400|403|409"

# ── Audit: namespaces and who logs ────────────────────────────────────────────
api "$T" PUT "$NS/sys/audit/probe-ns" '{"type":"file","options":{"file_path":"stdout"}}'
row P26 Ledger "enable an audit device inside a namespace" "recorded (root only?)" "HTTP $ST${ERR:+: $ERR}" yes
sleep 1
logged=""
for n in vault-1 vault-2 vault-3; do
  c=$(audit "$n" '.type == "response" and .request.path == "kv/data/breakglass/lock-gates" and (.request.namespace.path // "") == "'"$NS"'/"' | wc -l | tr -d ' ')
  logged+="$n=$c "
done
row P26 Ledger "root audit device logs namespaced requests (request.namespace.path)" "entries on some node" "$logged" "$([[ "$logged" =~ =[1-9] ]] && echo yes || echo no)"
ex=$(for n in vault-1 vault-2 vault-3; do audit "$n" '.type == "response" and .request.path == "sys/control-group/authorize"'; done | head -1)
note "An authorize entry in the audit log (fields): $(jq -c '{auth: (.auth | {entity_id: (.entity_id != null), display_name, policies}), req: (.request | {path, operation, namespace}), resp_keys: (.response.data // {} | keys)}' <<<"$ex" 2>/dev/null)."
ex=$(for n in vault-1 vault-2 vault-3; do audit "$n" '.type == "response" and .request.path == "kv/data/breakglass/lock-gates" and (.response.wrap_info != null)'; done | head -1)
note "A held read in the audit log: wrap_info keys $(jq -c '.response.wrap_info | keys' <<<"$ex" 2>/dev/null), request.data hmac'd: $(jq -c '.request.data // empty' <<<"$ex" 2>/dev/null | cut -c1-80)."

# ── Write docs/capabilities.md ────────────────────────────────────────────────
took=$(($(date +%s) - started))
mkdir -p "$BUILD_DIR/probe"
{
  cat <<EOF
<!-- Generated by make probe. The table and the notes quote Vault verbatim
     (long lines, <nil>, * bullets), so these rules are off for this file. -->
<!-- markdownlint-disable MD013 MD033 MD037 MD060 -->

# Capabilities: what Vault 2.2.1 actually does

Measured by \`make probe\` (scripts/probe.sh) on $(date -u +%Y-%m-%d) against
this lab's cluster ($(vault version | awk '{print $2}') CLI, server
$(curl -sf --cacert "$VAULT_CACERT" "$VAULT_ADDR/v1/sys/health" | jq -r .version)), in a scratch namespace
deleted afterwards. Every answer is Vault's, verbatim. The design of prompts
04 to 07 follows these answers; where they differ from the brief, the brief's
decision was changed (docs/STATE.md says which).

Result: $pass passed, $fail failed, in ${took}s.

## Answers (measured 2026-11-11; the table below is this run's evidence)

1. **Licence.** Namespaces, Control Groups and Sentinel are listed. No feature
   is named SCIM, and SCIM works with this licence (P3 to P6).
2. **Control Groups in a namespace.** A factor's \`group_names\` names a group
   of the request's namespace; \`sys/control-group/{request,authorize}\` work
   under it. The **root** \`sys/config/control-group\` is the one that
   applies: a namespaced write is accepted (204) and ignored (P10, the held
   request's \`wrap_info.ttl\` follows the root value).
3. **Governance context.** A query parameter reaches Sentinel as
   \`request.data\` on a KV v2 read: \`?ticket=HAR-0417\` passes, no ticket is
   refused (403, \`egp standard policy ... evaluation resulted in denial\`). The
   EGP is evaluated again on the unwrap and still passes (P12). A rule written
   for \`request.operation is "read"\` leaves writes alone.
4. **The algorithm change.** A Control Group factor on
   \`transit/keys/<k>/algorithm\` holds it; the key stays v1 after the request
   and after one approval; the unwrap applies it once (a second unwrap:
   \`wrapping token is not valid or does not exist\`). The EGP sees
   \`request.data.type\` and \`parameter_set\` and refuses other targets with a
   403 before any approval, also \`aes256-gcm96\`, which Vault itself refuses
   without the EGP (\`incompatible algorithm aes256-gcm96 for key type
   ecdsa-p256\`, P13).
5. **Verifier.** Node 24 (\`node:24-alpine\`, v24.22) verifies the v1 ECDSA
   P-256 signature with the PEM from \`GET transit/keys\`, and the v2
   ML-DSA-65 signature with the key from
   \`transit/export/public-key/<k>/2\` (1952 raw bytes, wrapped in an SPKI
   header; \`GET transit/keys\` has no public key for an ML-DSA version).
6. **SCIM.** A SCIM token needs \`renewable: false\` (else \`SCIM tokens
   cannot be renewable\`); it is type \`scim\`, orphan, scoped to the
   client's entity. With \`alias_mount_accessor\` = userpass, a userpass login
   of a provisioned user is the SCIM entity. **Group removal:** the person
   still logs in and her old token still works; her approvals are recorded
   and never counted, and an approval she gave **before** leaving stops
   counting too (counting happens at check time). **\`active=false\`:** the
   entity is disabled; her old token, a new login and any approval answer 403
   \`permission denied\`. Vault accepted a \`replace\` of \`userName\` (the docs
   say only \`active\`); an admin cannot write a SCIM group's members through
   the identity API (400).
7. **Self and double approval.** The requestor without the authorize policy
   gets 403. A keyholder's second approval is recorded once. An outsider with
   the authorize policy gets 200 \`approved: false\`: listed, not counted.
   **An approval lives as long as the approver's token:** revoking it removes
   the approval, and a request that had two drops back to one (P27). The
   console keeps a stage hand's token for its TTL for that reason.
8. **Audit.** Audit devices exist only in the root namespace (a namespaced
   path is \`unsupported path\`); the root device logs namespaced requests
   with \`request.namespace.path\`, on the node that served the request.

| Case | Chapter | Call | Expected | Vault's answer | Match |
| --- | --- | --- | --- | --- | --- |
EOF
  cat "$ROWS"
  printf '\n## Notes\n\n'
  cat "$NOTES"
} >"$OUT"
jq -n --argjson pass "$pass" --argjson fail "$fail" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg mech "$mech" \
  '{pass: $pass, fail: $fail, at: $at, ticket_mechanism: $mech}' >"$BUILD_DIR/probe/results.json"
echo "probe: $pass passed, $fail failed in ${took}s; wrote docs/capabilities.md"
[ "$fail" -eq 0 ]
