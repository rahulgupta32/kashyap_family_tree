# Current development state

## Master completion milestone — additive audit, calendar privacy and production controls

Authority: user adopted the attached Master Development Prompt on 2026-10-14. Continue compatible recoverable milestones without an artificial one-task stop; keep frozen scope/approvals/security intact and let slow CI finish independently. See `DECISION_LOG.md`.

Current source identity is this meaningful commit: resolve `git log -1 --format=%H -- docs/development-control/CURRENT_STATE.md` after fetching actual integration HEAD. Published exact SHA/tree/run IDs and each observed result are appended to PR #5. Do not create documentation-only rebuild loops. Branch `feat/application-completion`, PR #5 draft/open on existing M4 base; no merge/deploy/store authorization. No submitted reviews/inline threads at recovery.

Recovery checkpoint `c80433c6079033f39d97bc9555990d8a65047b34`, tree `7174a54ebf80e7ed246aa5b55bb5f65938d50903`, is now fully green in all four workflows: PR CI38560862785, PR native38560862836, push CI38560855763, push native38560855873. All six PR jobs/native steps inspected. Flutter182 cases/clean analysis, real fictional Android/API and simulator Keychain/unsigned build passed. Source-bound closure: https://github.com/rahulgupta32/kashyap_family_tree/pull/5#issuecomment-6168256666 .

Retained evidence independently checked: restore11893145089 ZIP digest4b07ff2ffe0cf13e1b68da4bff6790fd4d20a320ab009757db534e0f72b333d4, PASSED82tables/59migrations; native11892472658 ZIP digest62eb507e2805cfc8bef6b0cfbcb69b1f1d4030317c6b528798041481f9a1c44b, exact SHA/tree, 44 native archive files +7 verification input bytes/hash matches and all9 body markers. Production/PITR/RPO/RTO/signed/physical/APNs acceptance remain false. Earlier native failures remain indexed in `CI_FAILURES.md`.

Completed current engineering work (new-source CI PENDING):

- Full additive requirement/edge-case matrix:260 mandatory FR/NFR rows, independently260 cases,2924 unscored supplemental source/ADR records. Exact frozen texts,31 NFR targets, layer paths/status, related tests/evidence limits, privacy/dependencies/blockers and remaining acceptance are preserved. No individual signed closure is invented; no arbitrary percentages. Existing ledgers remain byte-identical.
- All7 requested control files now exist, with supporting CSV/review evidence and public release ownership handoff and private detailed operational documents. Infrastructural/signing/provider/owner gaps are explicit rather than represented as configured.
- Native calendar session isolation across events/browse/period/audience/recurrence: synchronously expire cached private state/drafts/previews on session replacement/service swap, reject stale responses/actions and keep same-family refresh stable. Ordinary period/browse toolbar access is available. Added15 widget +5 session-observer regressions.
- Two-level CI: fast affected checks on feature pushes, full mandatory unchanged PR suites and main/develop/dispatch acceptance; redundant full feature-push copies removed. Planner is conservative for unknown/first/incomplete diffs, source mismatches fail. Android remains mandatory in every full acceptance trigger.
- Production media HMAC selector rejects absent/short/known fixture/whitespace credentials; actual service signer and key bindings have10 passing local regressions. Managed random provisioning and independent security acceptance remain open.

Local validation PASS:20 fast-planner regressions,10 matrix negative integrity cases, frozen matrix/release/workbook/whitespace checks, cached-tool shared compilation/API TypeScript and10 production HMAC cases. Pnpm wrapper11.25.0 rejected the pinned engine; no frozen install/lock mutation/security waiver was claimed. Flutter unavailable locally; all new mock widget/analyzer/native/platform evidence awaits exact-source GitHub jobs. Native/source locks were not changed.

Parallel file ownership was reviewed before one authoritative publication: matrix/validator, calendar routes/tests, CI/planner, operations handoff; root owned service/key/control integration. Older worktrees/recovery branches remain untouched. No artifact cache/dependency symlink is committed.

Immediate next action: inspect this actual HEAD's Fast developer validation, CI and native workflows. Require all selected fast checks, full six-job CI, native success and all new regressions; fix demonstrated failures only. While slow full/native acceptance remains independent, proceed only with compatible reviewed work that does not rely on an unverified failure. Candidate next native ordinary-event detail/composition scope is in `NEXT_TASK.md`. Full RG-01..12 readiness remains NOT READY in `RELEASE_CHECKLIST.md`, with public gate ownership in `EXTERNAL_HANDOFF.md` and detailed operational documents provided privately.

The sections below are historical snapshots; their pending statements are superseded only by the exact-source closure above or later PR evidence.

## Current bounded batch — durable failed native push opt-out

New implementation source identity: the commit containing this section (resolve `git log -1 --format=%H -- docs/development-control/CURRENT_STATE.md` after fetching the branch). Published exact SHA/tree, automatic run IDs and observed conclusions are also appended to PR #5's source-bound handoff; do not create documentation-only commits just to chase that commit's CI.

Recovery HEAD: `b7ec666cbd1aae9262dd1bb38d1f42619237671f`, tree `c28c3adbcb50ce96024d8dbbdaeba18d0abf293f`; local tree clean and remote/PR checked. No newer remote commit or uncommitted active-checkout source was overwritten. PR #5 remains draft/open/unmerged on its existing M4 base.

Completed bounded implementation: secure session-bound pending-removal marker, preservation through refresh/restoration, idempotent failed-opt-out retry before push reacquisition, confirmed durable acknowledgement, explicit re-enable supersession and generation/serialized-write fencing. Added 13 focused mock regressions and updated one existing lifecycle expectation to require reconciliation. Report: `docs/execution/NATIVE_PUSH_OPT_OUT_RECOVERY_REPORT.md`.

Local frozen assessment/workbook/whitespace checks PASS. Flutter/Dart unavailable locally: new analyze/widget/platform/native verification is PENDING until its automatic exact-source results are inspected. No earlier green result is credited to this new implementation.

Closed prior routing batch at the exact recovery HEAD:

| Source | Run | Actual conclusion |
|---|---:|---|
| `b7ec666cbd1aae9262dd1bb38d1f42619237671f` | PR CI 38470234155 | SUCCESS, all six jobs inspected |
| Same source | PR iOS 38470234134 | SUCCESS, startup/Keychain/evidence and unsigned device compilation |
| Same source | push CI 38470226640 | SUCCESS |
| Same source | push iOS 38470226429 | SUCCESS |

Inspected platform logs: 419 unit, 542 general PostgreSQL/Redis, 61 browser and successful fictional restore. Dedicated storage covers ten cases skipped in the general suite. Prior routing Flutter evidence: clean analysis/169 tests including all 16 routing regressions. Inspected checkpoint iOS job 115547109771 includes real Keychain markers, successful driver, evidence collection and cleanup. Closure: https://github.com/rahulgupta32/kashyap_family_tree/pull/5#issuecomment-6167764383 .

Preserved earlier failures at `b515d59709e46487a51ac0d59dd9738efc9efecd`: push iOS 38469789349 failed the bounded test-launch phase; PR iOS 38469796673 reached driver success but failed test-evidence collection. Native launch/evidence reliability remains OPEN; no simulator change or manual rerun was made.

Next action: fetch actual latest HEAD/PR, inspect this commit's exact-source automatic Flutter/platform/native jobs and any failure evidence. Confirm all 13 new regressions and the updated lifecycle case executed. Fix demonstrated failures only and record closure in PR #5. Then stop at this batch boundary. Next workflow candidate is listed in `NEXT_TASK.md`; do not combine it with opt-out reconciliation. All 260 final acceptance rows and production gates remain OPEN; no main merge/deployment.

The sections below are historical observations; pending statements are superseded only by the exact-source closure above and subsequent source-bound PR evidence.

## Current bounded batch — published; CI verification pending

Implementation source: `b515d59709e46487a51ac0d59dd9738efc9efecd`.
Tree: `a6b360d7eaa6f90f5324effe4c27f6d0d136021a`; fetched published bytes match the reviewed local tree exactly.
Initial control baseline commit: `0e29791a6cd18f87a629ccdad6e2e9f13ce94111` (created before the feature).
PR #5 remains draft/open/unmerged on its original base.

Completed implementation: native generic background/terminated tap signals → current authenticated inbox after launch restoration and the existing MFA gate; foreground bilingual inbox action; SDK payload stripped at the source boundary; generation/disposal checks and duplicate-tap coalescing. Added eight router and eight widget/mock-HTTP regressions. See `docs/execution/NATIVE_PUSH_INBOX_ROUTING_REPORT.md`. No backend/provider/native/dependency/frozen policy changes.

Local release assessment, workbook validator, whitespace and source review PASS. Flutter/Dart unavailable locally; no local widget/analyzer/device success claimed.

| Exact implementation source | Run ID | Observed status/conclusion |
|---|---:|---|
| PR CI | 38469796590 | IN PROGRESS / null (PENDING) |
| PR iOS | 38469796673 | IN PROGRESS / null (PENDING) |
| push CI | 38469789351 | IN PROGRESS / null (PENDING) |
| push iOS | 38469789349 | IN PROGRESS / null (PENDING) |

Focused implementation-source verification completed: PR CI Flutter job `115545621196` SUCCESS at `b515d59709e46487a51ac0d59dd9738efc9efecd`. Retrieved logs show clean analysis and all eight new router/eight new widget cases passing, including real persisted-session refresh through mocked HTTP and the MFA failure/retry gate. The full CI workflow and native jobs remain PENDING; this focused success is not full production acceptance. ClamAV job `115545621343` also completed SUCCESS.

Observed UTC 2026-10-13 at 21:22. Actual later results must be retrieved from GitHub. Source-bound handoff: https://github.com/rahulgupta32/kashyap_family_tree/pull/5#issuecomment-6155446169 . These runs cannot verify a later checkpoint commit. This documentation-only checkpoint's own exact SHA is obtained with `git log -1 --format=%H -- docs/development-control/CURRENT_STATE.md`; its independently triggered run IDs/conclusions are recorded in the final source-bound PR #5 handoff. Never publish another checkpoint merely to chase that checkpoint's CI: append exact-source outcomes to PR #5, then fold them into the next meaningful implementation checkpoint.

Failure evidence: no demonstrated new-batch failure at this observation; prior PR iOS 38456236256 remains FAILED (pre-body launch timeout) alongside the independently successful same-source push run. Do not assume running checks passed.

Exact next action: fetch latest remote HEAD and PR; inspect the above runs and the latest checkpoint SHA's automatic runs, Flutter job 115545621196 is already inspected and passed all 16 new cases. Confirm the remaining workflow conclusions; inspect exact failing phase/log/artifact if any job fails. Fix demonstrated failures only. Record results and close this routing batch before considering durable failed-opt-out reconciliation in a later batch. No second feature, full manual rerun, main merge or deployment is part of this handoff.

Preservation: local publication used the authenticated GitHub connector because shell push has no credential helper. Git API trees were compared with local reviewed trees; final branch update required the expected remote SHA and used no force. Local equivalent commits are retained on `recovery/local-push-inbox-source`; working source was switched to the exact fetched published commit only after tree equality and clean status. Older worktrees remain untouched.

## Verified recovery baseline

Verified recovery baseline (UTC 2026-10-13): `94e3189f50b83c384ef18213c497378668b705a2`, tree `df1c37db4b1ffa4016078ebc41ae5fbf7bb80c33`.
Repository `rahulgupta32/kashyap_family_tree`; integration branch `feat/application-completion`; PR #5 is draft/open/unmerged, base `feat/m4-governed-workflows`.

These development-control files did not exist at the fetched baseline. This initial checkpoint is established before new implementation. Historical evidence remains in `docs/execution/RECOVERY_CHECKPOINT.md`, feature reports and source-bound PR #5 comments; this directory controls future resumption.

## Inspected CI evidence

| Source | Workflow run | Actual conclusion |
|---|---:|---|
| `94e3189f50b83c384ef18213c497378668b705a2` | PR CI 38456236239 | SUCCESS; all six jobs completed successfully |
| Same source | push iOS 38456225526 | SUCCESS; startup/Keychain, unsigned device compilation, source evidence |
| Same source | PR iOS 38456236256 | FAILURE; startup step failed, unsigned device build passed |

The failed PR-native run remains failed. Retained diagnostics and prior PR evidence identify a pre-body simulator launch timeout. An independent same-source success does not change that check's conclusion or authorize release. Do not rerun full workflows or change simulator settings speculatively.

## Recovery and preservation

A fresh detached worktree was created at the fetched remote HEAD. Existing checkout at `/workspace/scratch/5e2fc4c1b8d2/kashyap_family_tree` retains its untracked Python cache. Its notices worktree has older uncommitted native/API changes already represented in newer remote source; it is preserved without copying or recommitting them. Other older checkouts include local commits and an iOS-script modification; none was reset, cleaned, overwritten or pushed. Inspect each before any later recovery. No newer remote work was lost.

Active bounded task and criteria: see `NEXT_TASK.md`. Release gates: see `PRODUCTION_READINESS.md`. New implementation is not verified by the older runs above.

## Resume protocol

Fetch the current remote branch and PR first; inspect working trees and these files. Compare all recorded runs to their own `head_sha`; running/queued/missing is PENDING, never SUCCESS. Select one bounded task, validate, review, commit and fast-forward push; never force/reset. Record source SHA, tree, run IDs, actual conclusions and failures here. A checkpoint cannot embed its own SHA: resolve its identity with `git log -1 --format=%H -- docs/development-control/CURRENT_STATE.md`; exact later CI outcomes can be appended to PR #5 with the tested SHA/run IDs without triggering documentation-only CI loops. Stop before another feature. No main merge/deployment without all release gates.
