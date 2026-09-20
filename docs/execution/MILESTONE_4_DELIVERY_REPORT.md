# Milestone 4 acceptance evidence

Updated 2026-09-20. PR [#4](https://github.com/rahulgupta32/kashyap_family_tree/pull/4) remains open against `develop`.

The verified checkpoint is `8bfe0fbb943523fb351d2c73db0651d48c61b88e`. Its [PR workflow 35514467567](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567) completed successfully across the platform, Flutter, Android and live ClamAV jobs. This evidence replaces the earlier completion summaries and test totals. A later correction prevents stale claims-list responses during browser session restoration from replacing current review feedback; its verification is tracked by the subsequent commit's CI.

| Verification tier | Observed result | Scope and limits |
|---|---|---|
| API unit tests | 107 passed | Includes explicit mocks and isolated unit fixtures; not live device evidence |
| PostgreSQL integration tests | 161 passed | Real PostgreSQL 16 and Redis; destructive suites create and identity-check disposable databases |
| Playwright | 13 passed | Browser authentication, claim evidence download, two distinct reviewers, persisted ownership, change fields, profile reload and non-host RSVP |
| Flutter analysis | No issues | Static analysis |
| Flutter HTTP/widget tests | 19 passed | Mock HTTP responses and widget interaction; clearly separate from Android acceptance |
| Android APK and real API/device flow | 1 passed, `00:50 +1: All tests passed!` | APK built, installed and launched; live NestJS requests and PostgreSQL readbacks |
| Live ClamAV daemon | Clean PNG accepted; compressed EICAR detected; stopped daemon rejected | Real TCP daemon in CI, not the test scanner; Windows deployment is not asserted |

## Android execution record

- Device: `emulator-5554`, `sdk_gphone64_x86_64`, Android API 35.
- API: `http://10.0.2.2:3010` inside the emulator, host `http://127.0.0.1:3010`.
- Database: disposable CI service database `kashyap_test_android`; fixtures are fictional.
- Commands: `node scripts/seed-m4-device-fixtures.cjs`, then `bash scripts/run-m4-device-acceptance.sh`.
- The script runs `flutter build apk --debug --dart-define-from-file=../../test-results/m4-device-defines.json`, `adb -s emulator-5554 install -r ...`, `adb shell am start ...`, and `flutter test integration_test/m4_live_api_device_test.dart -d emulator-5554 --dart-define-from-file=../../test-results/m4-device-defines.json --reporter expanded`.
- [Device/build/API logs, fixture identities, test output and installed APK artifact](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567/artifacts/10606781425).
- Root `197d971d-4320-4a0e-b240-d5ee2f4b2817`; parent `156f3de4-4e37-4e4c-9383-e3620163a510`; child `9832405d-d27a-49f9-b690-44f09e68cd49` in that isolated run.

The test signs in through native OTP verification, persists tokens in Android secure storage, saves an unlinked account without creating a synthetic person, selects a non-first search result, asserts child person IDs differ from relationship IDs, navigates back, and checks rendered ancestor/root/child names. It submits a claim through the app and approves it with two distinct API reviewers, submits a correction and checks approved occupation/birthplace readbacks, saves and reopens the linked profile, records RSVP, restores/rotates the native session and clears it on logout.

SMS transport in CI is explicitly simulated. Authentication, session rotation and business API/database operations are real. No fake genealogy service supplies device results. The first device run failed because a submit tap missed the button with the native keyboard open; the test now dismisses the keyboard, scrolls to the action and requires a successful hit test. Failed runs remain visible in GitHub history.

## Privacy and governance protections

- Both private media routes require JWT authentication, user-bound signature validation where supplied, current permissions and clean/retained assets. Eight real HTTP/database tests cover anonymous, unauthorized, revoked, expired/malformed, quarantined and deleted cases.
- Verified parent/child/spouse membership is fetched from the database before directory, detail, relatives, tree and export privacy evaluation. Hidden relatives are omitted; inaccessible tree roots are rejected. Branch scope uses role assignments.
- Profile updates share one transaction through privacy, preferences and readback. Unlinked profiles remain account metadata. Omitted fields are preserved.
- Claim and change approvals preserve reviewer separation, ownership, graph validation, optimistic versions and durable audit intent.
- Native tokens are stored using platform secure storage; refresh is coordinated and revoked sessions are cleared.
- Cultural rules and ephemeris gates remain closed until the required approved data and sign-offs exist. Passing tests do not approve cultural rules.

## Remaining application and deployment work

M4 acceptance is evidence for these workflows, not proof that the entire application is finished. Community, chat, household maps, remaining mobile flows, imports, offline operation and production operations are tracked on the application-completion branch. No PR was merged by this work.

The user's Windows D: storage, databases, backups and unrelated workloads were not accessed or changed from the review environment. Production SMS/push/email credentials, deployed ClamAV, domain/TLS, operational restore rehearsal and cultural authority approvals remain deployment gates. Local historical logs are not reused as evidence for newer commits.
