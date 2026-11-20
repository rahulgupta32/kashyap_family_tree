# Validation record and reproducible commands

Preparation results below are local and source-reviewed; they are not deployed acceptance. Exact published commits, source-bound Actions IDs, APK checksum and live emulator outcomes belong in the delivery handoff and retained artifacts.

Toolchain: Flutter3.47.5/Dart3.13.4; Node24.22.1; frozen repository dependencies. Flutter bootstrap's network resolution was unavailable in this workspace. Hosted archives were fetched from pub.dev and SHA256-checked against the existing pubspec.lock; the unchanged lockfile resolved offline. No package version or application dependency was added. Flutter commands executed through the official SDK tool entry point with `CI=true BOT=true` and analytics disabled:

```sh
SDK=/workspace/scratch/57e933d686c9/flutter-sdk
CI=true BOT=true FLUTTER_ROOT="$SDK" \
  "$SDK/bin/cache/dart-sdk/bin/dart" \
  --packages="$SDK/packages/flutter_tools/.dart_tool/package_config.json" \
  "$SDK/packages/flutter_tools/bin/flutter_tools.dart" --suppress-analytics analyze --no-pub
```

The equivalent standard Flutter commands from `apps/mobile`:

| Command | Observed local result |
|---|---|
| `flutter analyze --no-pub` | PASS, no issues |
| `flutter test --no-pub --reporter expanded` | PASS,342 tests (full suite at that checkpoint) |
| `flutter test --no-pub test/change_proposal_contract_test.dart --reporter expanded` | PASS,2 additional child/death contract widget tests |
| `flutter test --no-pub test/mobile_integration_corrections_test.dart test/notification_inbox_navigation_test.dart --reporter expanded` | PASS,8 tests including logout acknowledgement and corrected notice destination |
| `flutter test --no-pub test/claim_status_test.dart test/calendar_event_detail_test.dart --reporter expanded` | PASS,12 tests including withdrawal, private history visibility and session fencing |
| `flutter test --no-pub test/calendar_event_detail_test.dart test/calendar_management_test.dart test/calendar_session_test.dart test/heritage_ui_test.dart --dart-define=UI_SNAPSHOT_DIR=/tmp/nepali-renamed-screens --reporter expanded` | PASS,29 tests; previews are actual widgets with synthetic/mock data |

Overlapping counts are not additive. The final exact-source CI runs the complete suite including all new tests.

Backend from `services/api`:

```sh
./node_modules/.bin/jest --runInBand --testPathIgnorePatterns=integration --runTestsByPath \
  test/change-requests.service.spec.ts test/calendar-period.spec.ts \
  test/calendar-create-idempotency.spec.ts test/calendar-delivery.spec.ts \
  test/calendar-time.spec.ts test/email-auth.spec.ts \
  test/fcm-push.provider.spec.ts test/sms-message-delivery.spec.ts
./node_modules/.bin/tsc --noEmit
```

PASS:8 suites /81 tests, API typecheck. `services/api/node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit` from the repository root also passed. Admin changes are display copy only; no hooks, auth logic, queries, component library or accessibility controls were replaced.

Repository controls:

```sh
node scripts/build-mobile-integration-inventory.cjs
python3 -m unittest discover -s scripts -p test_usb_test.py
python3 -m unittest discover -s scripts -p test_internal_preview.py
bash -n scripts/run-m4-device-acceptance.sh
git diff --check
```

PASS:260 REST method/path entries /26 controllers;2 USB build-admission tests;1 preview-admission test; shell syntax and whitespace checks. Static inventory status is not live endpoint coverage.

## Required exact-source runner execution

This local environment has no PostgreSQL server, Redis server, Android SDK/emulator or Xcode. PostgreSQL/Redis-backed tests, real Android journeys, APK build/installation/signature inspection, actual screenshots and iOS verification are **pending source-bound CI**, not silently skipped acceptance.

The existing CI runs backend units, real PostgreSQL/Redis integration, browser tests, Flutter analysis/widgets, isolated storage/scanner/containers and native Android/iOS. New `m4-change-requests.integration.spec.ts` assertions verify terminal-state retention, requester ownership and corrected resubmission against PostgreSQL. Existing calendar integration suites exercise invitations, branches, preview expiry, version conflicts, history, notifications, cancellation and concurrency.

`scripts/run-m4-device-acceptance.sh` retains the four existing real-device journeys and adds:

```sh
flutter test integration_test/calendar_live_api_test.dart -d emulator-5554 \
  --dart-define-from-file=../../test-results/m4-device-defines.json --reporter expanded
```

This test uses the actual NestJS/PostgreSQL/Redis service and UI to verify AD/BS month reads, creation/detail/history, update, RSVP, cancellation and unauthorized requests. Backend test SMS observation is synthetic and confined to the disposable CI backend. It is not real SMS or email delivery.

Artifacts after successful execution:

- `nepali-bansawali-debug.apk` and `android-apk-evidence.json` (source/tree, SHA256, package, version, minimum API, public signer certificate and exact API build input).
- `android-calendar-integration.log` and actual `android-nepali-login.png`, `android-nepali-calendar-month.png`, `android-nepali-calendar.png`.
- Normal existing Android/backend diagnostics and source-bound frozen acceptance matrix; its independent acceptance flags remain false.
- Separately labelled USB evaluation APK/evidence in `usb-test/`, if that additional build and loopback smoke test pass.

The emulator APK targets `http://10.0.2.2:3010`. CI services are temporary; this is not a persistent phone/staging preview. No production, real-family-data, cultural activation, distribution or merge approval is inferred.
