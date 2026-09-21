# Development recovery checkpoint

This file records executable progress so work can resume without a conversation transcript.

## Source and preservation

- Recovery baseline: `77ec6c40afd9cd608655c82a4e990823aa6b0fcb`.
- Branch: `feat/m4-governed-workflows`; PR #4 targets `develop` and remains open.
- Work is performed in an isolated source checkout. Uncommitted Windows work, D: storage, PostgreSQL/Redis data, backups and unrelated workloads have not been imported, overwritten or reset.
- Before resuming, inspect `git status`, the current branch and the remote HEAD. Preserve any existing changes; do not reset or clean the working directory.

## Checkpoint 1: privacy authorization

- Export branch selection uses administrative role assignments instead of every membership branch, and retains those assignments in the privacy viewer context.
- Detail, relatives and tree reads use current VERIFIED parent/child/spouse relationships loaded once per request. Relationship display objects do not grant permission.
- Inaccessible tree roots are rejected; inaccessible relatives are omitted without exposing their IDs.
- HTTP regression cases cover mixed branch roles, verified/unverified family links, family tree roots and revoked spouse verification.
- Local shared package builds, API TypeScript checking and all 107 backend unit tests passed. Checkpoint commit `173d193c1b128fcee75f9d865b036910ea953043` passed both CI runs, including the new PostgreSQL HTTP regressions: push `35496315673`, PR `35496317089`.

## Checkpoint 2: native mobile sessions and self-service

- Added phone/OTP sign-in using the actual native API contract (`otpSessionId`, `code`), secure token persistence, startup refresh rotation, single-flight refresh after 401 and logout.
- Public browsing remains available; an explicit selection is required for person-specific drawer actions.
- Profile editing loads saved values first, blocks saving after a failed load, and sends details/privacy in a single transaction-backed PATCH.
- Calendar RSVP submits the chosen event/response and reloads persisted results.
- Added mock-transport tests for authentication contracts, refresh concurrency, restoration, revocation and failed OTP, plus widget tests for sign-in, profile persistence, RSVP and second-result selection. These are not real-device acceptance evidence.
- Flutter is unavailable in this isolated editing environment; CI must validate this checkpoint before it is accepted.

## Checkpoint 3: actual governed browser actions

- Browser acceptance now creates fictional records, submits a claim with evidence, downloads evidence with the reviewer's JWT, completes Tier 1 and Tier 2 with different users, and reads back account/person ownership.
- Change-request acceptance approves both occupation and birthplace and checks persisted values and version advancement. This exposed and fixed ignored fields in the EDIT_PERSON write path; snapshots now retain the previous values.
- Added portal RSVP controls and a non-host browser RSVP/reload check. Profile acceptance asserts the exact saved address after reload and API readback.
- Added transaction consistency/rollback coverage for combined profile, privacy and notification updates.
- Checkpoint 2 CI completed backend/browser tiers successfully (107 unit, 151 integration); Flutter analysis found one async-context lint. Corrected that lint here. Flutter tests were not run in that failed workflow.
- Shared package build, workspace typecheck and 107 unit tests passed locally for these browser/backend corrections. Remote browser/integration/Flutter execution is still required for this checkpoint.

## Remaining M4 acceptance work

1. Verify the new Flutter sign-in/session and self-service changes in CI, then against a live API on Android.
2. Replace optional browser workflow checks with mandatory claims approvals, change approval, RSVP and persistence assertions using fictional fixtures.
3. Add HTTP regression evidence for both authenticated private-media routes and profile transaction consistency.
4. Verify a real ClamAV daemon and a real Android/API workflow, or explicitly retain their blocked status.
5. Update the delivery report from actual completed test output and the final commit's CI results.

## Application release scope

M4 acceptance is distinct from completion of the entire application. The master implementation plan also includes community/moderation, maps, messaging, offline synchronization, import, deployment and release verification. Cultural/legal/provider activation gates remain governed by `OPEN_GATES.md`; do not invent approvals or credentials. Keep test doubles identified as test doubles.

## Checkpoint 4: isolated acceptance jobs

- Corrected browser readbacks to use the current rotated session token, and English-only names in the change-review UI.
- Added real PostgreSQL/HTTP private-media coverage for anonymous access, stolen signatures, role revocation, malformed/expired signatures, quarantine and retention state.
- Flutter checks now run independently from browser tests.
- Added a real ClamAV CI service check: clean PNG, compressed EICAR (requiring daemon inspection), and fail-closed behavior after stopping the daemon. Live verification remains pending until this job passes; it does not install a daemon on the user's Windows machine.
- Workspace typecheck passed locally. Previous checkpoint's backend tests passed; its two newly strengthened browser scenarios failed and are corrected here.

## Checkpoint 5: reproducible Android acceptance

- Checkpoint 4 remote platform job passed 107 unit, 161 PostgreSQL integration, and 13 browser tests. Live ClamAV 1.4.6 passed clean PNG, compressed EICAR, and stopped-daemon rejection (run 35499802070).
- Flutter analysis passed; 18/19 tests passed. Updated the old startup smoke test to check the new empty-session sign-in behavior.
- Added an Android API 35 CI job with a dedicated PostgreSQL database, fictional four-person fixture, real native OTP/session APIs, selected-person navigation, claim submission/two reviewers, governed change, profile persistence, RSVP, secure session restore and logout. Test SMS transport is explicitly simulated; business API responses are not mocked. This new device job is pending execution.
- API and emulator logs, fixture identifiers and a debug APK are retained as CI artifacts. This job is limited to PR runs to avoid duplicating emulator builds for the same branch push.
