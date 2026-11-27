#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $# != 1 ]]; then
  echo 'Usage: deploy.sh /absolute/path/to/staging.env' >&2
  exit 2
fi
config=$(realpath "$1")
[[ -f "$config" && $(stat -c '%a' "$config") == 600 ]] || { echo 'Secret configuration must have mode 0600' >&2; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
compose=(docker compose --env-file "$config" -f "$root/infra/staging/compose.yml")
# Validate without printing interpolated secrets.
"${compose[@]}" config --quiet
for variable in API_IMAGE POSTGRES_IMAGE REDIS_IMAGE MINIO_IMAGE MINIO_MC_IMAGE CLAMAV_IMAGE; do
  reference=$(sed -n "s/^${variable}=//p" "$config")
  [[ $reference =~ @sha256:[a-f0-9]{64}$ ]] || { echo "$variable requires an immutable image digest" >&2; exit 1; }
done
"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 900
curl --fail --silent --show-error http://127.0.0.1:3010/health/ready
