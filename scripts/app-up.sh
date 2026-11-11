#!/usr/bin/env bash
# scripts/app-up.sh: phase 11 (make app-up). Build images if missing, hand
# start the app stack, wait until the API answers.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"

prefix=$(vgov_conf VGOV_IMAGE_PREFIX)
tag=$(vgov_conf VGOV_IMAGE_TAG)
# Until a service's image can be built (web lands in prompt 07) start the rest.
services=${APP_SERVICES:-}
if [ -z "$services" ] && [ ! -f "$VGOV_ROOT/web/nginx/default.conf.template" ]; then services="volume-init api"; fi
for t in api web; do
  [ -f "$VGOV_ROOT/$t/Containerfile" ] || continue
  if ! podman image exists "$prefix/$t:$tag"; then
    echo "app-up: $prefix/$t:$tag not found, building"
    "$VGOV_ROOT/scripts/app-build.sh" "$t"
  fi
done
# shellcheck disable=SC2086
"$VGOV_ROOT/scripts/compose.sh" app up -d $services
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$(vgov_conf VGOV_PORT_API)/api/health" >/dev/null 2>&1 && break
  sleep 3
done
curl -sf "http://127.0.0.1:$(vgov_conf VGOV_PORT_API)/api/health" >/dev/null || die "app-up: the API is not healthy (make app-logs)"
# Only reached after a successful start: one-shot init containers go (compose
# recreates them on the next up). A failed start keeps them and their logs.
"$VGOV_ROOT/scripts/compose.sh" app rm -f volume-init >/dev/null 2>&1 || true
echo "app-up: stack started, the API answers; one-shot volume-init removed"
echo "  Console: https://localhost:$(vgov_conf VGOV_PORT_WEB)/   (lab CA; make trust-root to trust it)"
echo "  API:     http://127.0.0.1:$(vgov_conf VGOV_PORT_API)/api/health"
