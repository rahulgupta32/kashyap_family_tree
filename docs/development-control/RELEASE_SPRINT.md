# Release sprint — 21 October 2026

Authority: Jyphra Technology Pvt. Ltd. Target: production-ready first release, subject to approved baseline disposition. No mandatory feature is deferred by this plan. No merge, deployment or store submission is authorized.

Planning window: 96 hours from kickoff on 21 October, ending 25 October Nepal time. 24 October is the candidate-readiness checkpoint, not a claim that four full days have elapsed. Exact candidate remains unappointed.

## Execution and integration

One integration owner reviews and publishes the existing integration branch. Parallel tasks have separate file ownership; no independent concurrent pushes. Use exact-source CI and focused checks; retain failures and never replace a pending outcome with an assumed pass. Every blocker needs source/evidence, dependency, responsible role, acceptance test and actual result. Role names below are required responsibilities, not invented appointments or approvals.

| Window | Required outcome |
|---|---|
| 0–12h | Reconcile current code and frozen requirements; approve scope dispositions; identify named external owners and environment |
| 12–48h | Complete independent cross-layer journeys, infrastructure preparation and governed data/domain prerequisites in parallel |
| 48–72h | Integrate candidate; execute functional/negative/security/accessibility/load/device acceptance |
| 72–96h | Freeze features; restore/rollback/UAT and exact-candidate evidence review; Jyphra go/no-go |

## Initial blocker register

| ID | Blocker / dependency | Responsible role | Required exit evidence | Current status |
|---|---|---|---|---|
| B01 | Claim retry widget tap misses viewport after layout change | Mobile/QA | Exact-source clean Flutter analysis and complete suite, retry identity assertions retained | Verified at4c14f9e (260 Flutter tests); later-source checks separate |
| B02 | Member claim status/correction/resubmission/dispute and process-restored pending identity | Member lifecycle engineering | Authorized API/admin/mobile complete lifecycle, account-switch/negative/retry evidence | Discovery/durable retry/versioned correction recovered; older pagination/admin Tier2 correction integrated LOCALLY through8aec913; runtime pending; remaining lifecycle open |
| B03 | Import promotion writer disabled | Data engineering + Data Steward | Approved mapping/consent; controlled promotion/resume/reconciliation and two accepted rehearsals | OPEN |
| B04 | Cultural proposal state stored in process-local Map | Domain engineering + cultural authority | Durable independent approval/restart/concurrency evidence; approved rules before activation | Durable proposal/MFA/history code integrated LOCALLY8aec913; migration/PG runtime/authority provisioning pending; HG gates closed |
| B05 | Production environment and recoverability not verified | Operations | Approved stack, private storage/scanner/workers/TLS/secrets, alerts, measured PITR/restore/rollback | OPEN; preparation only |
| B06 | Example native identities/debug signing and live providers/device acceptance | Release/mobile + account owners | Approved identities, signed artifacts, physical-device SMS/FCM/APNs lifecycle evidence | OPEN |
| B07 | Independent security/privacy/accessibility/localization/load/UAT acceptance | Named reviewers + Product Owner | Requirement-specific exact-candidate evidence and signed required decisions | OPEN |
| B08 | Scope and final release authorization | Jyphra release authority | Approved dispositions, RG-01..12 closure and explicit go/no-go | OPEN |

This targeted register does not replace the 260-row requirement register, 260 edge cases, supplemental controls or RELEASE_CHECKLIST. Other incomplete workflows remain mandatory until formally disposed. Source audit is targeted, not a completed per-line audit. No aggregate completion percentage or guaranteed launch is asserted.

## Recovered source evidence

PR5 source d0bc6e107beedf6c03841db7d49a1723b660e7e1: iOS38780047751 SUCCESS; Fast38780039580 FAILURE; Main38780047946 FAILURE. Main platform job116577570666 passed including567 general integration and71 browser cases; private S3, Android/live API, ClamAV and fictional repository benchmark jobs passed. Flutter job116577570579 clean analysis,255 passed/1 failed. Log identifies retry button centre at y600 outside800x600 root after error-message layout change; no weakened assertions or timeout increase permitted. Prior source success is not verification of the next commit.

## 22 October local recovery update

Remote4c14f9e remains published; local code through8aec913 is not published. Source publication is a new explicit blocker B09 owned by repository owner/applicable approval review: the public source/documentation upload was rejected; exact reviewed payload approval and permitted checks required, no workaround. Integrated539 unit/type/build/frozen checks pass; new-source PG/Flutter/browser/native and migrations pending. RECOVERY_CHECKPOINT_20261022.md records all four local batches and remaining human/engineering owners. Decision remains NO-GO.

## Continued local integration — 22 October

User target revised to **26 October 2026**; no mandatory requirement or acceptance gate is waived. B02 now also includes locally implemented scanned correction additions and acknowledged durable pending-creation resolution/closure; full dispute and runtime acceptance remain OPEN. B04 now includes a private proposal governance UI, with final bounded review and runtime acceptance pending. Full backend non-integration verification is 571 tests/53 suites PASS; final admin production build PASS. B03/B05/B06/B07/B08/B09 remain OPEN with the roles above. See CLAIM_RESOLUTION_AND_GOVERNANCE_UI_REPORT for the exact evidence limits and human dependencies. New source remains unpublished; decision NO-GO.
