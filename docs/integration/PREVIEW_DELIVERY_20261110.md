# Offline preview delivery — 10 November 2026

## Verified first deliverable

Source `e5c00f08f879ad26941be08306088b1d49ca4551`, tree `02fe08b47260e50e666a1a902840f2e9be6be1e5`.

[Offline preview workflow42768755336](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/42768755336) completed SUCCESS. [Download artifact13741191940](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/42768755336/artifacts/13741191940), unexpired at verification.

- APK: `nepali-bansawali-offline-preview.apk`.
- APK SHA256: `3dc2ecc2f3c9eba21fd823c9a589641b5de88cb496b27cc39ec8ca2d901ef908`.
- Artifact ZIP SHA256: `c54ee6d7a79ec65919e1973f1755e482995795d5039510a6153d6a8330858165` independently matched GitHub; extracted APK hash independently matched evidence.json.
- Debug package `com.example.kashyap_mobile.devpreview`; visible Offline Preview label. Debug signer certificate SHA256 `16877c77f5deb7b3da2e5440d4de0055c2d313eba17f5034198e4feb88cc2afd`.
- Build: `KASHYAP_DEV_PREVIEW=true flutter build apk --debug --target=lib/main_dev_preview.dart --dart-define=ENABLE_DEV_PREVIEW=true`.
- Real native Gradle controls rejected preview flags on the normal release entry, the preview release entry and a profile build. Source-graph tests exclude synthetic imports from the production entry.
- Build, analysis and seven focused preview tests passed. This first workflow does not establish emulator installation, physical-device acceptance, real backend persistence or provider delivery.

Download/unzip, verify SHA256, then install with `adb install -r nepali-bansawali-offline-preview.apk` or open the APK on an Android test phone. Tap **Enter Development Preview** without entering credentials. Top controls: switch-account cycles the five personas; restart resets sample data; exit returns to preview login; apps opens the catalog. All data is fictional and memory-only. A new debug signing key can require manually removing only the old Offline Preview app before reinstalling; do not remove other app identities.

## Screen inspection inventory

All rows below use existing Flutter components, not an independently rebuilt design. The underlying production implementation must be judged separately from offline fixture behavior. No row claims full production completion.

| Catalog destination | Offline result | Real integration / remaining acceptance |
|---|---|---|
| Family tree | Synthetic three-generation navigation | Implemented source; full graph/privacy/device acceptance remains |
| Member profile | Fictional details and relatives | Implemented source; real approved edits/privacy acceptance remains |
| Calendar | Memory create/edit/cancel/RSVP/history | Existing live calendar journey; expanded invitations/notification/device acceptance remains |
| Calendar month/day/agenda | Synthetic original-calendar period | Existing real AD/BS reads; complete supported-device/date acceptance remains |
| Community | Memory posts/comments/likes | Existing real implementation; moderation/media/recovery acceptance remains |
| Messaging | Memory conversation frames and sends | Real REST/socket implementation remains separate; reconnect/attachments/device acceptance remains |
| Notifications | Memory read state/preferences | Real inbox/provider/device delivery acceptance remains separate |
| Official notices | Fictional notice/detail | Real visibility, published notices and distribution acceptance remains |
| Account and settings | Synthetic account and entry links | Real account/settings/session persistence acceptance remains |
| Privacy form | Memory preference/profile save and reload | Real owner isolation and approved privacy acceptance remains |
| Claim form | Synthetic request entry | Real evidence, review and final profile association acceptance remains |
| My claims | Own synthetic request collection | Real lifecycle and recovery acceptance remains |
| Change proposal form | Synthetic proposal creation | Real authoritative review/application acceptance remains |
| My change requests | Own synthetic request collection | Existing member correction/resubmission; complete native acceptance remains |
| Approved cultural content | Empty approved-content state | No cultural rules activated; requires approved content/authority |
| Administration / role inspection | Clearly labelled role illustration | Actual Next.js portal and real role/branch/audit workflows require full-stack testing |
| Locations and maps | Explicit limitation; no GPS collected | Real consent/map permissions/persistence require isolated full-stack acceptance |

The dashboard is the entry screen, separate from these17 destinations. Unsupported provider, upload, security and governance actions explain that authenticated full-stack testing is required; they are not silently marked successful. Local navigation tests covered all17 destinations. Native screen driving and10 PNG captures are added in the follow-on workflow and remain pending actual execution.

## Continued full-stack correction

Two failing service regressions demonstrated that a supplied branch selection was ignored when listing change requests. The query now validates the branch identifier and combines that selection with existing ownership/status restrictions; reviewer isolation remains in force.19 focused service cases,687 complete backend unit tests/63suites and API typechecking passed locally. A new PostgreSQL regression verifies selected-branch results, own-request filtering and rejection of an out-of-scope reviewer selection. Actual database execution is pending exact-source CI, not inferred from mocks.

## Publication and release limits

The full interrupted local work remains on recovery/offline-preview-complete-20261110 (original ba8d955). Automatic review rejected publication of generated detailed API/database/authorization inventories because approval for that specific public disclosure was missing. Those generated inventory changes were excluded from the published preview; they were not uploaded through another path. A separate owner decision is required before publishing them. The safe screen-level inventory above is not a replacement for those internal contracts or the frozen acceptance ledger.

No merge, production deployment, paid provisioning, real-data mutation or cultural activation occurred. Full-stack persona entry, approved staging, real providers/signing, physical phones, independent security/privacy/accessibility/Nepali/UAT and operational recovery gates remain open. Offline preview is available; publication readiness is not established.

## Separate full-CI failure and focused recovery

Main42768754811 at e5c00f0 completed FAILURE solely in the Android live journey. Platform/PostgreSQL/browser, Flutter, private storage, scanner, search and runtime-container jobs completed SUCCESS. Android passed three journeys; the first failed at m4_live_api_device_test.dart349 with `StateError: No element` while polling a ChoiceChip during successful calendar RSVP/list reload. The fixture now waits for the replacement chip within the unchanged20-second deadline, then retains exact selected-chip and actual API `myRsvp=GOING` assertions. No application authorization, data contract or timeout is changed. The corrected native journey still needs exact-source execution. iOS42768754779 was pending when inspected. The failed main workflow is not reclassified as success by the separate successful offline APK build.

## Follow-on build configurations and local validation

The independent workflow also builds the existing `.usbtest` integration package separately, using `http://127.0.0.1:3010`. It requires an isolated laptop backend and `adb reverse tcp:3010 tcp:3010`; it does not bypass login. The readiness/checksum/device-selection Windows helper remains `scripts/connect-usb-test.ps1`. This build prepares physical-device acceptance, but cannot prove acceptance without a phone. Staging remains a separate protected HTTPS/signing configuration requiring approved inputs; no staging artifact is invented.

Follow-on local validation:687 backend units/63suites; API typecheck;17 focused preview/calendar widget tests; clean mobile static analysis;3 release/import policy tests;2 USB admission tests; shell syntax/YAML parsing/whitespace checks. New PostgreSQL assertions and original-APK installation/17-screen native driving/10PNG captures require actual follow-on CI. The downloadable first APK above remains independently available while those checks run.

## PostgreSQL fixture correction

Main42771202693 at0b7da23 passed687 unit tests but failed one of632 general integration cases (621 passed/10 skipped): the new selected-branch regression reused the suite's shared person after an earlier branch-transfer test had intentionally moved it. Its positive selected-branch assertion correctly returned no such requests. The regression now creates independent people in both branches and retains every positive inclusion, foreign-owner exclusion and reviewer denial assertion. Production query/authority behavior is unchanged by this fixture correction. Exact corrected-source PostgreSQL verification remains required. Both offline and USB build jobs in42771202695 passed separately; native17-screen/10capture acceptance was queued when inspected.

## Native SDK source binding correction

The new native preview job in42771202695 stopped before emulator/application execution because its reused SDK preflight correctly required `KASHYAP_SOURCE_HEAD_SHA`, which the new workflow had omitted. The workflow now supplies the exact PR source SHA (or dispatch SHA) to the unchanged preflight, and retains SDK diagnostics alongside native evidence. No source-matching check, SDK validation or application assertion was bypassed. Native screenshots remain unverified until the corrected workflow runs successfully. First and follow-on APK build successes remain independent evidence.
