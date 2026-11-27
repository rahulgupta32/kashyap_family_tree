#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-results
for image in kashyap-api:fixture kashyap-admin:fixture; do
  test "$(docker inspect --format '{{.Config.User}}' "$image")" = node
done
# Disposable synthetic runner only. Test mode does not attest production providers,
# private object storage, TLS, staging connectivity, PITR or any release approval.
docker run -d --name kashyap-api-fixture --network host \
  -e NODE_ENV=test -e PORT=3012 -e USE_REAL_POSTGRES=true \
  -e DB_HOST=127.0.0.1 -e DB_PORT=5432 -e DB_USER=container_fixture \
  -e DB_PASSWORD=synthetic_container_password -e DB_NAME=container_fixture \
  -e REDIS_HOST=127.0.0.1 -e REDIS_PORT=6379 -e SEED_ADMINS=false \
  -e JWT_SECRET=synthetic_container_fixture_secret_32_characters \
  kashyap-api:fixture
docker run -d --name kashyap-admin-fixture --network host -e PORT=3013 kashyap-admin:fixture
for port in 3012 3013; do
  endpoint="http://127.0.0.1:$port"
  if [ "$port" = 3012 ]; then endpoint="$endpoint/health/ready"; fi
  ready=false
  for attempt in $(seq 1 90); do
    if curl --fail --silent --max-time 3 "$endpoint" > "test-results/container-$port-http.txt"; then
      ready=true
      break
    fi
    sleep 1
  done
  test "$ready" = true
done
python3 - <<'PY'
import json, os
from pathlib import Path
health = json.loads(Path('test-results/container-3012-http.txt').read_text())
assert health['status'] == 'ok' and health['database'] == 'up'
assert health['databaseType'] == 'real-postgresql'
Path('test-results/container-evidence.json').write_text(json.dumps({
    'commit': os.environ['KASHYAP_SOURCE_HEAD_SHA'],
    'nonRootImages': True, 'apiReady': True, 'adminHttp': True,
    'realPostgres': True, 'syntheticRunnerOnly': True,
    'stagingVerified': False, 'productionAcceptance': False,
}, indent=2) + '\n')
PY
