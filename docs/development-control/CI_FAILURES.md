# CI failure and verification register

Every conclusion belongs to its recorded SHA and run, not to the current branch in general. Pending runs are never successful evidence. Failed runs remain failed even where later source succeeds. Full history remains in existing execution reports and PR #5; this register indexes the current recovery sequence.

| Source SHA | Run | Observed conclusion / demonstrated phase | Follow-up / supersession |
|---|---:|---|---|
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
