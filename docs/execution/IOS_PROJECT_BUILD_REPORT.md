# iOS native source and verification

The verified predecessor `3d7872b3007839872f385535f75d03e70da5a444` shipped an Android runner but no iOS runner/project. The Flutter client, iOS sign-in metadata tests and shared authentication workflows were already implemented; they are preserved.

## Bootstrap and intended verification

A read-only macOS CI workflow uses the same pinned Flutter 3.47.5 as the existing checks. Initial scaffold generation runs in a separate temporary application and copies only its iOS native directory, avoiding regeneration of the existing Dart and Android implementation. The generated placeholder bundle identity is for compilation and review, not an approved production identity. The display name is the existing Nepali application name.

The workflow compiles the iOS simulator app, runs a native integration check against the real simulator Keychain (fictional write/read/delete fixture), verifies the signed-out bilingual application starts without backend traffic, and compiles an unsigned device app. Both builds use the reserved `https://api.invalid` endpoint; there is no production API connection, Apple identity, certificate, provisioning profile, signing, distribution upload or deployment.

Native source is archived with a per-file SHA-256 inventory. Git ignore rules exclude machine configuration, build products and plugin caches; symlinks and paths outside the iOS source directory are rejected. The 42 reviewed native source files are now present, including the Xcode runner/workspaces/scheme, delegates, Flutter configurations, storyboards, development icons and CocoaPods lockfile. The bootstrap fallback is removed: a missing committed project fails CI instead of being silently regenerated. Native source changes during subsequent builds also fail evidence capture rather than being reported as unchanged source. Evidence distinguishes uncommitted generated scaffolding from committed source and records the exact source commit/tree.

## Verification status

Workflow YAML parsing, shell syntax, release assessment and local diff checks passed. macOS/Xcode/Flutter are unavailable locally. Bootstrap `e915eb1072d7162c88eedb008d124a7fae53e46f` passed macOS PR run 38239989933. Artifact 11742884649 was inspected: exact source/tree, all 42 native file hashes, simulator and unsigned-device builds, and one actual simulator Keychain/startup case passed. The observed toolchain was Flutter 3.47.5, Xcode 16.4 and an iPhone 16 Pro simulator on iOS 18.5. Generated native deployment target is iOS 15.0; this is not an approved full supported-device matrix. The evidence correctly recorded `nativeSourceCommitted: false` during bootstrap. Final committed-source builds/tests require fresh exact-head verification and a true committed-source flag before this batch is marked verified. The PR checkpoint records actual results, including any initial failures and their corrections; no test is reported as passed in advance.

## Remaining mandatory gates

Simulator startup and Keychain checks are narrower than physical-device/live-backend acceptance. Apple Developer ownership, approved bundle identity/store branding (development identifiers and generated icons are placeholders), certificate/provisioning management, signed archive/store distribution, physical iPhone/iPad matrix, device accessibility, biometric/pinning policy, real backend iOS workflows, managed Firebase/APNs configuration, native push lifecycle and real delivery remain OPEN. Production recovery/load/security/accessibility acceptance, approved imports and cultural approvals also remain mandatory. All 260 frozen acceptance records and architecture decisions are preserved. No merge or deployment occurs in this batch.
