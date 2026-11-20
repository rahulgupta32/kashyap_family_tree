#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test-results/dev-preview-device
python3 - <<'PY'
import hashlib,json
from pathlib import Path
root=Path('test-results/dev-preview')
e=json.loads((root/'evidence.json').read_text())
assert e['applicationId']=='com.example.kashyap_mobile.devpreview'
assert hashlib.sha256((root/e['filename']).read_bytes()).hexdigest()==e['sha256']
PY
adb -s emulator-5554 install -r test-results/dev-preview/nepali-bansawali-offline-preview.apk
adb -s emulator-5554 shell am start -W -n com.example.kashyap_mobile.devpreview/com.example.kashyap_mobile.MainActivity
adb -s emulator-5554 shell pidof com.example.kashyap_mobile.devpreview > test-results/dev-preview-device/original-apk-pid.txt
# Use an instrumentation build for screen-by-screen driving; the original APK
# above is independently installed/launched and remains the owner deliverable.
adb -s emulator-5554 uninstall com.example.kashyap_mobile.devpreview
(
 cd apps/mobile
 KASHYAP_DEV_PREVIEW=true flutter drive --driver=test_driver/dev_preview_driver.dart \
  --target=integration_test/dev_preview_device_test.dart -d emulator-5554 \
  --dart-define=ENABLE_DEV_PREVIEW=true
) 2>&1 | tee test-results/dev-preview-device/native-preview.log
python3 - <<'PY'
import hashlib,json,subprocess
from pathlib import Path
p=Path('test-results/dev-preview-device')
log=(p/'native-preview.log').read_text()
assert 'All tests passed.' in log and '[OFFLINE PREVIEW SCREENSHOTS] All10 native synthetic screen captures verified' in log
assert '[OFFLINE PREVIEW DEVICE] Credential-free entry,17 catalog destinations,persona switch and exit verified with synthetic data only' in log
images={}
for f in p.glob('preview-*.png'):
 b=f.read_bytes()
 assert len(b)>=33 and b[:8]==b'\x89PNG\r\n\x1a\n' and b[12:16]==b'IHDR'
 assert int.from_bytes(b[16:20],'big')>0 and int.from_bytes(b[20:24],'big')>0
 images[f.name]=hashlib.sha256(b).hexdigest()
assert len(images)==10
(p/'native-evidence.json').write_text(json.dumps({'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'originalPreviewApkInstalledAndLaunched':True,'instrumentedCatalogDestinations':17,'screenshots':images,'logSha256':hashlib.sha256(log.encode()).hexdigest(),'syntheticOnly':True,'physicalDeviceVerified':False,'backendPersistenceVerified':False,'productionAcceptance':False},indent=2)+'\n')
PY
