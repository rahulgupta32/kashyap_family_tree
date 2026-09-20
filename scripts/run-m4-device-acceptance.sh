#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
mkdir -p test-results
adb devices -l | tee test-results/android-device.txt
adb -s emulator-5554 shell getprop ro.build.version.release >> test-results/android-device.txt
adb -s emulator-5554 shell getprop ro.build.version.sdk >> test-results/android-device.txt
adb -s emulator-5554 shell getprop ro.product.model >> test-results/android-device.txt
cd apps/mobile
flutter pub get
flutter build apk --debug --dart-define-from-file=../../test-results/m4-device-defines.json 2>&1 | tee ../../test-results/android-build.log
cp build/app/outputs/flutter-apk/app-debug.apk ../../test-results/kashyap-m4-debug.apk
adb -s emulator-5554 install -r build/app/outputs/flutter-apk/app-debug.apk
adb -s emulator-5554 shell am start -n com.example.kashyap_mobile/.MainActivity
flutter test integration_test/m4_live_api_device_test.dart -d emulator-5554 --dart-define-from-file=../../test-results/m4-device-defines.json --reporter expanded 2>&1 | tee ../../test-results/android-integration.log
