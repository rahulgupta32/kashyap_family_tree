# कश्यप अधिकारी वंशावली — mobile client

Flutter client for Android and iOS. The existing genealogy, governed workflows, community/chat, calendar, profile and authentication implementation is shared across both native runners.

Use the CI-pinned Flutter 3.47.5. From this directory:

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --dart-define=API_BASE_URL=https://your-approved-api.example
```

For iOS, use macOS with Xcode and the native dependency tooling supported by Flutter. The committed runner uses an iOS 15.0 deployment target. This development minimum does not constitute final supported-device approval.

```sh
flutter build ios --simulator --debug --dart-define=API_BASE_URL=https://your-approved-api.example
flutter build ios --release --no-codesign --dart-define=API_BASE_URL=https://your-approved-api.example
```

The macOS CI workflow verifies simulator compilation, a disposable simulator's real Keychain write/read/delete, signed-out bilingual startup with zero backend requests, and unsigned device compilation. See `docs/execution/IOS_PROJECT_BUILD_REPORT.md` in the repository root. Run the fixture startup check only on an explicitly disposable simulator; it must not use customer credentials.

The iOS `com.example.kashyapMobile` bundle identifier and generated native icons are development placeholders. Production Apple/Google identifiers, signing ownership, provisioning, store assets, supported-device acceptance and distribution require their release gates. No unsigned CI build is a production release.

Release startup requires an explicit HTTPS `API_BASE_URL` pointing to the approved API. The development emulator HTTP default and reserved placeholder hosts show a bilingual unavailable screen and cannot create an authenticated API client in release mode. Do not put provider credentials, tokens or other secrets in `--dart-define`; the URL is bundled with the app. Debug builds may still use the local emulator API.

Native push SDK/permission/token lifecycle and actual Firebase/APNs delivery, full iOS live-backend and physical-device workflows, device accessibility, biometric/pinning policy and production acceptance remain open. Use an approved HTTPS API endpoint for deployment; the CI-only `https://api.invalid` endpoint prevents backend traffic during native compilation/startup verification.
