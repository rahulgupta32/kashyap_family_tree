#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover -s scripts -p test_usb_test.py
python3 scripts/build_usb_test.py
adb -s emulator-5554 reverse tcp:3010 tcp:3010
adb -s emulator-5554 reverse --list > test-results/usb-test/adb-reverse.txt
apk=$(find test-results/usb-test -maxdepth 1 -name '*.apk' -print -quit)
test -n "$apk"
adb -s emulator-5554 install -r "$apk"
adb -s emulator-5554 shell am start -W -n com.example.kashyap_mobile.usbtest/com.example.kashyap_mobile.MainActivity
adb -s emulator-5554 shell pidof com.example.kashyap_mobile.usbtest
(
  cd apps/mobile
  KASHYAP_USB_TEST=true flutter test integration_test/usb_live_api_test.dart -d emulator-5554 \
    --dart-define=API_BASE_URL=http://127.0.0.1:3010 --dart-define=KASHYAP_DISPOSABLE_USB_TEST=true \
    --reporter expanded
) 2>&1 | tee test-results/usb-test/emulator-smoke.log
python3 - <<'PY'
import json
from pathlib import Path
path = Path('test-results/usb-test/evidence.json')
data = json.loads(path.read_text())
data.update(installationVerified=True, emulatorSmokeVerified=True,
            emulatorChecks=['USB reverse TCP3010', 'API readiness', 'phone OTP session', 'profile read', 'logout'])
path.write_text(json.dumps(data, indent=2) + '\n')
PY
adb -s emulator-5554 reverse --remove tcp:3010
