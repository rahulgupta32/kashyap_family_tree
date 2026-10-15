# CI failure and verification register

Every conclusion belongs to its recorded SHA and run, not to the current branch in general. Pending runs are never successful evidence. Failed runs remain failed even where later source succeeds. Full history remains in existing execution reports and PR #5; this register indexes the current recovery sequence.

| Source SHA | Run | Observed conclusion / demonstrated phase | Follow-up / supersession |
|---|---:|---|---|
| `119f987b1db22893a0c3356a637fac238c7db27b` | Fast38611278852 / CI38611288843 / iOS38611288848 | SUCCESS; inspected clean analysis/all232 Flutter, all six platform jobs/native; platform logs434 unit/548 general integration/61 browser and fictional restore | Closes the prior omitted chat-store fixture failure for this exact source; later resolution/admin implementation requires its own CI |
| `0e26e628dee58685087e414aac14f65d278fa20a` | Fast38609751149 / full Flutter job116009765298 | Fast FAILED; full Flutter FAILED: analysis clean,231 passed/one failed; invalid pending-state fixture called native chat secure-storage delete on host | Supply MemoryChatOutboxStore and assert cleanup, preserving production behavior and all rejection checks; correction exact-source CI pending. Full38609761447/native38609761328 still in progress at recovery |
| `94e3189f50b83c384ef18213c497378668b705a2` | 38456236256 PR iOS | FAILED, pre-body simulator test-launch deadline; unsigned device compilation passed | Same source push iOS 38456225526 SUCCESS, retained source-bound closure in PR. Reliability gate remains open; failed check is not relabelled |
| `b515d59709e46487a51ac0d59dd9738efc9efecd` | 38469789349 push iOS | FAILED at bounded `test-launch`; no driver/body success | Later checkpoint `b7ec666...` native runs passed; no simulator/source change was used as a speculative fix |
| `b515d59709e46487a51ac0d59dd9738efc9efecd` | 38469796673 PR iOS | FAILED at `test-evidence` after driver `RESULT_VERIFIED` and `All tests passed` | Evidence failure remains a failed workflow, not accepted solely from driver output; later checkpoint native verification passed |
| `b7ec666cbd1aae9262dd1bb38d1f42619237671f` | 38470234155 /38470226640 | PR/push general CI SUCCESS | Six PR jobs inspected; 419 unit/542 PostgreSQL+Redis/61 browser, dedicated storage/scanner/scale/Android/restore |
| Same b7ec666 source | 38470234134 /38470226429 | PR/push native SUCCESS | Inspected startup, real fictional Keychain, driver/evidence/cleanup and unsigned device compilation; real provider/physical device acceptance not claimed |
| `c80433c6079033f39d97bc9555990d8a65047b34` | 38560862785 /38560855763 | PR/push general CI SUCCESS at master-audit recovery | All six PR jobs completed; Flutter clean/182 cases. Restore artifact 11893145089 independently ZIP-digest/result checked: 82 tables/59 migrations, PASSED, production/PITR/RPO/RTO all false |
| Same c80433c source | 38560862836 /38560855873 | PR/push native SUCCESS after independent completion | PR artifact11892472658 digest checked, exactSHA/tree, 44 archived native +7 verification inputs equal committed bytes, all9 body markers, Keychain/unsigned compilation verified; physical/APNs/signed acceptance false |

## Evidence protocol

1. Fetch actual branch HEAD, event source SHA and run attempt. Inspect all jobs, failed steps, logs and retained artifacts; never infer success from an upload or summary count.
2. A failure before a test body is infrastructure/launch evidence; a body assertion failure requires its exact assertion; an evidence-collection failure still fails acceptance. Do not relabel any of them.
3. Inspect source SHA/tree and artifact hashes. Preserve native source and dependency locks unless the demonstrated failure requires a reviewed change.
4. Apply the smallest correction, run relevant regressions, publish using expected-head fast-forward, and let automatic workflows run. Do not launch a duplicate full workflow merely because a session is ending.
5. Append final source-bound conclusions to PR #5; fold them into the next meaningful source checkpoint. Do not create endless documentation-only commits to chase their own CI.

Relevant retained reports: `docs/execution/IOS_EXPLICIT_VM_CONNECTION_REPORT.md`, `IOS_BOUNDED_VERIFICATION_RECOVERY_2026-10-13.md`, `NATIVE_PUSH_INBOX_ROUTING_REPORT.md`, `NATIVE_PUSH_OPT_OUT_RECOVERY_REPORT.md` and `RECOVERY_CHECKPOINT.md`. No historical report or failure artifact was overwritten by this register.

## Local toolchain limitation

The master-audit container pnpm wrapper is11.25.0 and refused the repository's pinned >=9.15.9<10 engine. The rejected commands did not validate a frozen install. API/shared TypeScript and the10 media signing-key regressions were instead executed directly against cached dependency tooling; they passed. No lock/engine/security relaxation was made. New GitHub jobs must install using pinned pnpm9.15.9 and record actual conclusions. Flutter remains unavailable locally.

## Master calendar lifecycle correction

Source `e8010f30038c1a806a8db29817e7f753705aa31c` Fast run38567069054 FAILED and full PR CI38567076178 has demonstrated Flutter Analyze failure: `use_build_context_synchronously` at calendar_events_screen.dart79/170. The private-session helper checked mounted at runtime, but Flutter analyzer requires an explicit mounted guard at each post-await context use. Add `mounted &&` at only those RSVP/manage error-message sites; do not disable the lint or change semantics/tests/security guards. Widget execution was not reached. Fast TypeScript/backend job115862457229 passed429 units and admin/API/shared checks; frozen planner/matrix validators passed. Other full/native jobs remain independent and must be inspected separately. Corrected-source execution is pending until its automatic runs finish.

## Calendar refresh fixture timeout

Source `6089424e080635a126e8205aa362781ec0d01f1e`: Fast38567628940 and full PR38567633814 FAILED. Flutter jobs115864375104/115864286112 each passed analysis and201 tests; `same session access rotation keeps loaded events and controls available` timed out after10minutes. All other14 new calendar cases and5 observer cases passed. Both exact job logs inspected. This is a test-body timeout, not native simulator launch evidence. Narrow fixture correction moves OTP setup to `tester.runAsync` without changing production code, assertions, timeouts or skips. Corrected-source checks PENDING. Earlier e801 analyzer failures and this timeout remain failed; later passing source does not relabel them.

Fixture refinement before claiming closure: source4ac9287 automatic checks remain pending; no conclusion is invented. Exercise401 token rotation through the actual calendar refresh button instead of bridging an artificial probe between FakeAsync/real clocks. Pump initial serialized setup, retain every prior assertion and add exact refresh/read counts. No production code, test timeout or skip changes. This is a further correction of the demonstrated6089424 fixture timeout, not a claimed completed4ac9287 failure.

## Source-bound fixture closure and independent native evidence

Intermediate4ac9287 Fast38569438391/full38569448557 FAILED at the same10minute rotation fixture timeout,201 tests passed, analysis clean; Fast job115870555498 log inspected. b62f6c93b0d3ed2ced22762dea8a8a6b7eb76bed Fast38570253151 SUCCESS; Flutter job115873367485 clean/202passed including exact previouslytimedout case through realcalendarrefreshbutton; full38570262065 Flutter independently SUCCESS. Full/native remaining work stays PENDING until retrieved. Historical failures remain failed.6089424 full38567633814 FAILED Flutter while allotherfive jobs succeeded; native38567633757 SUCCESS, driver/Keychain/unsigned/evidence logs/steps inspected. e801 native38567076330 SUCCESS, priorFast/full analyzerfailure preserved.


## Recovered current-source native launch failure

Source `b62f6c93b0d3ed2ced22762dea8a8a6b7eb76bed`: full general CI38570262065 SUCCESS, all six jobs inspected. Native38570262152 FAILED; job115873297042 log/steps inspected. Simulator bootstatus, simulator compilation, fixture build/install and unsigned device compilation succeeded; `test-launch` exceeded its existing30second deadline. No test-body success is credited. Artifact11896814505 retained with recorded ZIP SHA256 a8107e0006536cefa00342f2a71c6ed521f6b9bb2c6f03de1a114d168dd5423e, contents not independently inspected in this recovery. Do not infer a Keychain/application assertion failure or change simulator configuration without artifact evidence. The recovered ordinary composition code is independent of this pre-body infrastructure failure; its automatic exact-source native workflow must still be inspected.


## Native create privacy fixture analyzer correction

Source `ce0f1e9aa4e088273575b5a63d55ffbd25bba60d`: Fast38604295628 FAILED; Flutter job115991218739 log inspected. Analyze reports curly_braces_in_flow_control_structures at calendar_create_privacy_test.dart34/71, the multiline mocked preview return statements. Widgets did not execute. Correction adds explicit blocks in those test fixture branches; production code, assertions, timeouts and lint rules unchanged. New-source execution remains PENDING. Full38604311219/native38604311215 are independently pending until their actual conclusions are retrieved.

## Period/browse regression scroll target correction

Recovered exact remote/PR HEAD `24d42cfe73176859198a52c17f07222cfbff2739`, tree `a0ad81965db9f640ddc91814635eb82b114029d6`, with clean checkout. Fast38725916852 FAILED; inspected Flutter job116391703209: clean analysis,243 passed/two failed. Both new tests throw StateError Too many elements inside WidgetController.scrollUntilVisible (calendar_management_test.dart99/121), because its default finder also matches horizontal editable scrollables. Full38725924948 Flutter job116391636294 likewise FAILED; remaining full/native38725924842 results were pending at recovery.

This correction scopes only those two scrolling calls to Scrollable with AxisDirection.down, matching the existing calendar pagination regression. Production Dart code, data, assertions, timeout values and security/audience/session behavior are unchanged. No calendar editing feature started while this demonstrated regression remained open. Failure retained in CI_FAILURES. New-source Flutter execution remains PENDING: require clean analysis/all245 tests, including both previously failing widgets. Flutter/Dart unavailable locally. Local frozen matrix/release/workbook validators, ten matrix negatives, five workbook regressions and whitespace passed. Resolve this correction SHA/tree and automatic runs from the PR #5 handoff.

All260 final acceptance/production gates remain OPEN. No merge/deploy/manual full rerun. After verifying correction, inspect remaining calendar editing/end-time requirements as the next bounded task.

## Calendar period heading selector correction

Recovered GitHub HEAD `81a441f7505b509af0aafb06379d08e3ab33938a`, tree `5375cdbd83627fe95796ad2defdd7635814f40fa`, checkout clean. Fast38726450546 FAILED. Inspected Flutter job116393466911:244 passed/one failed, clean analysis. Both vertical scroll calls now succeed and browse midnight/BS/Tithi case passes. The remaining period assertion at line122 uses find.text on a value shared by EditableText input and Text day heading; actual result is two widgets. This is test selector ambiguity, not a displayed-time or server-grouping failure.

Correction selects exactly one Text heading with the expected day and separately asserts that the source input controller retains the same value. Nepal midnight and original source-query assertions stay intact; no matcher count relaxed, no production code/timeouts changed. New-source Flutter execution remains PENDING: require clean analysis/all245 cases. No unrelated feature added. All six user-stated release areas remain mandatory and ordered: complete frozen workflows; governed approved data; independent security/privacy/accessibility/localization/device acceptance; API/messaging load; production operations/DR; signing/live providers/UAT/Jyphra approval. Engineering evidence cannot substitute named authority or production acceptance.

Local matrix/release/workbook validators, ten matrix negatives, five workbook regressions and whitespace PASS. Flutter/Dart unavailable locally. Exact correction SHA/tree/automatic runs are in the source-bound PR #5 handoff. All260 final acceptance/production gates remain OPEN; no merge/deploy/manual rerun.

## Full completion sequence and ordinary-event fixture correction

Recovered actual GitHub/PR HEAD `ac3406229be61f6aa68f327be5f275c81fef91e6`, tree `868bbde33228148a1156c1f43305ee9a5854bf48`, clean checkout. Fast38729583986 SUCCESS. Main platform job116403788170 FAILED after454 unit/553 general integration passed:67 browser passed/one organizer journey timed out waiting for Event details. Test left default KUL_PUJA while expecting ordinary-only fields. Corrected fixture explicitly selects GENERAL_EVENT; added Event type accessible name. Every assertion, category protection and timeout preserved. Failure retained in CI_FAILURES; current-source browser/full/native remains pending.

Reviewed complete remaining-work inventories and release plans; new `COMPLETION_SEQUENCE.md` and CSV assign all260 requirements exactly once, retaining frozen requirement/acceptance/NFR fields and inherited260 edge cases/2924 supplemental controls. Checked coverage/uniqueness/exact fields locally. This is a planning reconciliation of the static register with targeted current-source checks, not a new claim of per-line verification or signed acceptance. Confirmed in-memory cultural proposals/import promotion disabled; consent flow needs closer design review. Six functional milestones plus assurance/performance/operations/release replace speculative calendar-only next work. All remaining scope stays mandatory; owner inputs start alongside engineering.

Local admin typecheck, three browser journeys listed only, frozen matrix/release/workbook validators and15 validator regressions/whitespace PASS. New-source browser runtime verification PENDING. Next: inspect exact-source CI/fix demonstrated failures, then F1 identity/privacy consent/supporting-evidence workflow review as a larger cross-layer milestone. No more speculative end-time additions without binding source semantics. All260 final acceptance and RG-01..12 OPEN. No merge/deploy/manual full rerun.

## F1 policy acknowledgement workflow — verification pending

Recovered GitHub/PR HEAD `d24a476be944cc17df4a303c4d50de7109e8945d`, tree `373921ed29408c68b3ad477093e958771f5468f9`, clean checkout. Fast38731166028/iOS38731174002 SUCCESS; main38731173915 FAILED at platform116409042349 while five other jobs passed. Browser organizer rescheduled successfully then navigated to original day; current test uses moved date, preserving all assertions/timeouts. Failure retained.

First F1 cross-layer workflow: immutable versioned bilingual approved-policy catalogue and account/content-bound explicit acknowledgements (migration061), atomic audit-only receipts, safe concurrent/lost-response replay, stale-version/hash rejection, current-account privacy and immutable evidence/downgrade guard; admin/mobile Policies screens with stable label keys, plain text, explicit checkbox, authoritative status reload, generic errors and scope/single-flight guards. No legal text seeded, no historical consent backfilled, no publication HTTP endpoint or mandatory sign-in gate; real policy publication/legal/retention/guardian approval remains open. This is not optional-consent or processing authorization.

Local all466 unit cases/48 suites/API typecheck+build/admin typecheck PASS; frozen validators/15 regressions/whitespace PASS. Five affected browser cases parse/list only. Added8 PostgreSQL/HTTP,4 Flutter and2 browser cases; real migration/PG/Flutter/browser/native source verification PENDING (expected252 Flutter/70 browser). F1's other requirements and all260 acceptance/release gates OPEN. Full limits: `docs/execution/POLICY_ACKNOWLEDGEMENT_WORKFLOW_REPORT.md`. No merge/deploy/manual full rerun.
