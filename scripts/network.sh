#!/bin/sh
# scripts/network.sh: create the shared network if it does not exist.
set -eu
podman network exists vgov-internal || podman network create --label io.vgov.project=vault_governor vgov-internal >/dev/null
