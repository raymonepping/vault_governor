#!/usr/bin/env bash
# scripts/app-build.sh [api|web ...]: build the app images (arm64). The build
# context is staged to $TMPDIR: macOS TCC can refuse Podman reads under
# ~/Documents, and xattrs break builds. The API image carries the story
# WITHOUT the break-glass value (lib/story.js publicStory) and the roster.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname -- "$0")/common.sh"
export COPYFILE_DISABLE=1

targets=${*:-api web}
prefix=$(vgov_conf VGOV_IMAGE_PREFIX)
tag=$(vgov_conf VGOV_IMAGE_TAG)

for t in $targets; do
  ctx=$(mktemp -d "${TMPDIR:-/tmp}/vgov-$t.XXXXXX")
  case "$t" in
  api)
    rsync -a --exclude node_modules --exclude test --exclude '._*' --exclude .DS_Store "$VGOV_ROOT/api/" "$ctx/"
    mkdir -p "$ctx/config"
    node "$VGOV_ROOT/scripts/story-check.js" >/dev/null
    node --input-type=module -e "import { readFileSync, writeFileSync } from 'node:fs'; import { publicStory } from '$VGOV_ROOT/api/lib/story.js'; writeFileSync('$ctx/config/story.json', JSON.stringify(publicStory(JSON.parse(readFileSync('$VGOV_ROOT/config/story.json', 'utf8'))), null, 2));"
    cp "$VGOV_ROOT/config/roster.json" "$ctx/config/"
    ! grep -rqF "$(jq -r .breakglass.fields.recovery_code "$VGOV_ROOT/config/story.json")" "$ctx" || die "app-build: the break-glass value reached the API image"
    ;;
  web)
    rsync -a --exclude node_modules --exclude dist --exclude test --exclude '._*' --exclude .DS_Store "$VGOV_ROOT/web/" "$ctx/"
    ;;
  *)
    echo "app-build: unknown target '$t'" >&2
    exit 64
    ;;
  esac
  xattr -rc "$ctx" 2>/dev/null || true
  # common.sh sets umask 077; the images run as non-root users that must read
  # these files.
  chmod -R a+rX "$ctx"
  echo "app-build: building $prefix/$t:$tag"
  podman build -q --format docker --platform linux/arm64 \
    --build-arg NODE_IMAGE="$(vgov_conf NODE_IMAGE)" \
    --build-arg NGINX_IMAGE="$(vgov_conf NGINX_IMAGE)" \
    -t "$prefix/$t:$tag" -f "$ctx/Containerfile" "$ctx" >/dev/null
  rm -rf "$ctx"
  arch=$(podman image inspect "$prefix/$t:$tag" --format '{{.Architecture}}')
  [ "$arch" = arm64 ] || {
    echo "app-build: $t is $arch, not arm64" >&2
    exit 1
  }
done
