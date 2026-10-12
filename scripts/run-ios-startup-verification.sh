#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
mkdir -p test-results
xcrun simctl list devices available --json > test-results/ios-simulators.json
simulator_id=$(python3 - <<'PY'
import json
from pathlib import Path
available=json.loads(Path('test-results/ios-simulators.json').read_text())['devices']
for runtime, devices in available.items():
    if '.iOS-' not in runtime:
        continue
    for device in devices:
        if device.get('isAvailable') and device['name'].startswith('iPhone'):
            print(device['udid'])
            raise SystemExit(0)
raise SystemExit('No available iPhone simulator; verification cannot proceed')
PY
)
state=$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(v["state"] for values in d["devices"].values() for v in values if v["udid"]==sys.argv[1]))' "$simulator_id")
if [ "$state" != "Booted" ]; then xcrun simctl boot "$simulator_id"; fi
xcrun simctl bootstatus "$simulator_id" -b
printf '%s\n' "$simulator_id" > test-results/ios-simulator-id.txt
cd apps/mobile
flutter test integration_test/ios_startup_test.dart -d "$simulator_id" --dart-define=KASHYAP_DISPOSABLE_IOS_SIMULATOR=true --dart-define=API_BASE_URL=https://api.invalid --reporter expanded 2>&1 | tee ../../test-results/ios-startup-test.log
