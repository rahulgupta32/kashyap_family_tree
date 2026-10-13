# Interrupted iOS verification recovery — 2026-10-13

Scope: native iOS verification only. PR #5 stays draft/unmerged; no deployment or next development workstream.

## Recovered facts

- GitHub HEAD was `3b2501cd6592bd4b13ddb867edadcb20d022c351`, ahead of reported `5597bd67af139a012f008e99f994191d9347cb8e`. Fresh checkout was clean; both newer commits were preserved.
- General PR CI `38283566932` succeeded for that HEAD.
- iOS `38281298368` at 5597bd6 booted its simulator (migration completed in approximately 76 seconds) and compiled the integration target (107.1 seconds), then stalled before the test-body log. The outer step killed it after 15 minutes. Logs cannot distinguish install/launch/VM connection failures from a pre-body application/plugin failure. Artifact `11762512194` was downloaded and inspected; it contains no test pass or device build evidence.
- Newer iOS `38283567028` at 3b2501c passed the one real Keychain/signed-out app test and unsigned device compilation. The job nevertheless FAILED: the final source archive detected unidentified untracked iOS files. This is not a complete green release witness. Artifact `11762594515` was downloaded and inspected.
- Both artifacts' Podfile.lock candidates are byte-identical to committed source (SHA-256 `987d5f8b6f76677c250f904e70e2aca4ad0ccd7dce0649f7b17602d23caac075`); their diffs are empty. No CocoaPods dependency change is justified. The SwiftPM-enabled project resolves Firebase and other supported plugins separately; CocoaPods currently retains Flutter/secure storage.

## Recoverable checkpoint

- Deterministic newest available iOS/iPhone pair; create a disposable simulator instead of inheriting state. Separate bounded inventory/create/boot/bootstatus/readiness/Flutter-discovery/test phases, process-group termination, 30-second heartbeats, persistent per-phase JSON and verbose test logs.
- Bootstatus deadline 180 seconds; integration command deadline 600 seconds; Dart test deadline 120 seconds; real Keychain operations 15 seconds each and UI settling 30 seconds. No automatic test retry, no continue-on-error. A command failure remains a failure even if its output contains success text.
- Dart markers distinguish binding, discovery, each Keychain operation, app mount, assertions and cleanup. Missing Firebase configuration and zero initialized Firebase apps are asserted; this test does not initialize or verify a configured Firebase/APNs project. The native secure-storage plugin is exercised, not mocked; backend HTTP remains a deliberate mock with zero requests.
- Failure diagnostics retain simulator inventory, process state, scoped app/debugserver/SpringBoard logs and a screenshot with their own short deadlines. Timeout classifications keep infrastructure failures, pre-discovery unknowns, app/plugin hangs and runner teardown separate without inventing a root cause.
- Strict native-source validation remains intact and now identifies unexpected paths. Always retain native status and bounded Package.resolved candidates for review. The post-build report compares against the pre-build archive; it no longer replaces that archive after compilation.
- Reviewed the successful-native-run Dart lock candidate: 87 packages, hosted sources exclusively pub.dev with SHA-256 integrity entries, only SDK alternatives, firebase_core 4.15.0/firebase_messaging 16.7.0/secure_storage 9.2.4 matching declarations. Commit this application lockfile and enforce it in iOS dependency installation.
- Unsigned device compilation still executes after a simulator integration failure when simulator compilation succeeded, so distinct build evidence is retained. Overall job/report remain failed unless every required gate passes.

Local verification: five regression tests (runtime order/unavailability, honest failure attribution, hung process/descendant termination, nonzero exit with misleading success output, strict native-source drift controls), shell/Python syntax, release assessment/workbook validators and whitespace checks passed. Native macOS checks require GitHub Actions; no local iOS pass is claimed.

## Remaining batch gates

Push this checked checkpoint before another long native run. Inspect exact-commit iOS outcome and post-tool native status; review/commit any required generated dependency files, then verify the resulting exact committed source. Record actual CI/run/artifact evidence here and in PR #5. Do not hide dependency/source drift to obtain a green report.

Production signing, approved IDs/icons, physical-device/live-backend/push acceptance, provider credentials, supported device matrix and wider production acceptance remain open. This batch does not close those gates or the frozen 260 final acceptance records.
