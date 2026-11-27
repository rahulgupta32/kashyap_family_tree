#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $# != 3 ]]; then
  echo 'Usage: backup.sh /absolute/path/staging.env /absolute/backup/directory age-recipient' >&2
  exit 2
fi
config=$(realpath "$1")
output=$(realpath "$2")
recipient=$3
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
compose=(docker compose --env-file "$config" -f "$root/infra/staging/compose.yml")
data=$(sed -n 's/^STAGING_DATA_ROOT=//p' "$config")
[[ "$data" == /srv/kashyap-staging/data && -d "$output" ]] || { echo 'Verify the bounded staging paths' >&2; exit 1; }
command -v age >/dev/null
scratch=$(mktemp -d)
cleanup() {
  "${compose[@]}" start minio api >/dev/null
  rm -rf -- "$scratch"
}
trap cleanup EXIT
# Stop the API and its in-process workers before the database/object pair is captured.
"${compose[@]}" stop api
"${compose[@]}" exec -T postgres pg_dump -U kashyap_staging -d kashyap_staging -Fc > "$scratch/database.dump"
"${compose[@]}" stop minio
archive="$output/$(date -u +%Y%m%dT%H%M%SZ).tar.age"
tar -C "$scratch" -cf - database.dump -C "$data" minio | age -r "$recipient" -o "$archive"
sha256sum "$archive" > "$archive.sha256"
# Retention applies only to this script's completed encrypted staging archives.
find "$output" -maxdepth 1 -type f -name '*.tar.age*' -mtime +7 -delete
