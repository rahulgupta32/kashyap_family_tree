# Production completion continuation — 9 November 2026

## Recovered published baseline — Verified

PR5 was independently draft/open/unmerged on `feat/application-completion`, base `feat/m4-governed-workflows`. Remote HEAD `8bdfc7539d78cc2c63281ef9e89fd9cc33d872b9` superseded local `9ce0ac3`; local history was retained on `recovery/local-20261109`, unrelated untracked files untouched. Main42271420934 and iOS42271420859 completed SUCCESS. The previous calendar/lifecycle/rename/resource-build work is already published; it was not recreated.

Android artifact13532830396 ZIP SHA256 independently matched `01c7cd2c115988924cecf440ab62b5fb4fad814dc8add2a3637f921c51667365`. Embedded evidence identifies:

- `nepali-bansawali-debug.apk`, SHA256 `87004d00e47703ecf647f4ceda10b334ea5a87f2379b345f2e5dfdeda2d34352`, emulator API `http://10.0.2.2:3010`, calendar emulator verified.
- USB APK `nepali-bansawali-usb-test-8bdfc7539d78.apk`, SHA256 `94ee0da9a5661eba19c12f3118786eb499e0930d50e25de3ab98d78d9c39dcd1`, API `http://127.0.0.1:3010`, emulator installation/loopback/readiness/OTP/profile/logout smoke verified.
- Both are debug evaluation packages requiring a running synthetic backend. Physical-device/staging/production acceptance remain false. These binaries predate this continuation's correction changes.

## Member correction changes — Implemented, runtime acceptance incomplete

`MyChangeRequestsScreen` now supports correction/conflict resubmission for RECORD_DEATH and ADD_CHILD as well as EDIT_PERSON. Death corrections use explicit stored BS date/year fields, validate their shape and allow optional dates to be cleared from the proposal. No cultural date conversion is invented. New-child corrections allow Nepali/English name and gender, retaining original living status and unrelated evidence. Existing-child proposals retain their `childPersonId` and expose only reason correction; no unreviewed relationship target mutation is offered. Unknown proposal types remain read-only.

All editors retain account/session fencing, owner detail checks, current allowed-state checks, disabled duplicate submission and authoritative reload after acknowledgement. Terminal decisions are not reopened. Changes are requests for privileged review, not direct genealogy writes.

Added mocked HTTP/widget regressions cover malformed death date/no POST, changed BS date, removed optional year, evidence retention, new-child name correction, preserved gender/living status, immutable existing-child target and controls disappearing after PENDING reload. Existing profile correction and global logout regressions remain. These fixtures do not establish real PostgreSQL persistence, provider delivery or physical-device acceptance.

Death correction published as `cc4818bb8665fa991b0cd0f4dc3b5f5f25f7151c`; main42591756152/iOS42591756083 were in progress when inspected. Final child/checkpoint publication and exact CI outcomes must be resolved from GitHub, without crediting earlier source results.

## Validation and release limits

The restored toolchain uses unchanged locked dependencies, with hosted archives SHA256-checked against SDK/application lockfiles. The first local test attempt failed before test loading because the recovered package cache was missing; after restoration the death batch's three focused tests passed. The combined child/death/profile/logout focused suite passed five tests. Final full Flutter suite: **348 passed**. Static analysis: **No issues found**. `git diff --check` passed.

No backend contract, database migration, production configuration or provider secret changed. No production deployment, paid provisioning, merge, store submission, real data or cultural activation occurred. All existing independent signed requirement acceptances and release gates remain open. Approved staging access, providers/signing, full cross-module real journeys, physical devices, independent security/privacy/accessibility/Nepali/UAT and operational restore/rollback acceptance remain required. Entire application publication readiness is not established.
