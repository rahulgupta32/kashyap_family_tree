# Application completion checkpoint

Updated 2026-09-24. Preserve M1–M4 protections, user D: storage, backups and unrelated workloads. Do not merge either pull request or deploy production from this checkpoint.

## Remote state and evidence

- M4 PR #4 remains open against `develop`. An earlier publishing error at `dafc7b1039b44bc73996c27b2a97c0e7737c0240` replaced its full tree with one file. The complete prior tree was recoverable; restoration commit `3ac8cdbe10a12b7be3a571c1a38dab58994c1a7b` is now published on M4. Its tree `26e127f7e91783074e8c0aee6cec598ad2ab8e98` contains all 352 files and differs from full checkpoint `cc05c8a8e51c3390cb721b2fc942f368d597466d` only in the intended device-test helper correction. No history was reset and no PR was merged.
- M4 verified checkpoint `8bfe0fbb943523fb351d2c73db0651d48c61b88e`: PR run https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567 passed platform, Flutter, live ClamAV and real Android/live API/PostgreSQL acceptance. The restoration commit needs its own CI evidence.
- Draft completion PR #5: `feat/application-completion` → `feat/m4-governed-workflows`. All 379 current files are present, including every M4 path. Chat, household consent, dashboard and audit work is published through `4cc9d24c038ff17d747297957b11ff7c023c1993`.
- Completion run https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35600441746 passed 108 unit and 185 real PostgreSQL integration tests, Flutter analysis/widget checks and live ClamAV checks. Browser result: 12 passed, 3 failed. Android was skipped on this push event. Do not report this run as green.
- Current corrections restore the dashboard's signed-out/revoked-session redirect and explicitly label the chat branch selector. Admin TypeScript check passed. The next completion commit incorporates the restored M4 parent while preserving its claims response race fix, Android helper fix and delivery report, which already match the completion tree exactly.

## Publication safety

Local histories were reconstructed from GitHub files and must never be force-pushed. Read the actual remote ref and its full base tree before creating an additive Git Data API tree. Verify complete path count, expected changed paths and original binary blob SHAs before updating a branch. Recheck the head, use a non-forced update, then verify the published commit/tree again. The September 21 restoration demonstrates why an isolated file tree must never replace a repository tree.

## New local work

1. Migration 012 and persistent chat API: direct-pair uniqueness, explicit branch-group membership, idempotent sends, bounded history cursors, read receipts, sender deletion, blocking, current-session WebSocket authentication, Redis typing expiry and private notification triggers. Web and native Flutter screens and tests added.
2. Migration 013 and household map: separate governed location entity; explicit reversible consent; independent branch review; profile/family/minor protection intersection; only coordinates rounded to 0.1° are saved. Public clusters require at least three consenting eligible households and fixed district cells. Query bounds filter generalized output, not private coordinates. Account deletion withdraws consent. Web and Flutter locality views and editing added.
3. Dashboard uses actual role-scoped counts instead of demo numbers. Audit browsing now reads PostgreSQL metadata with central authority, pagination and bounded parameterized filters; no fake in-memory audit trail is returned.
4. `RELEASE_ACCEPTANCE_LEDGER.csv` extracts all 229 functional and 31 nonfunctional requirements from the frozen master specification. All remain in mandatory Release 1 scope. Status is deliberately not inferred solely from a module test count.

## Audit and browser continuation

- Migration 014 and the version-2 audit writer serialize direct and outbox appends on one transaction lock; JSONB reordering no longer invalidates new digests. Historical hashes are preserved, with `LEGACY_UNVERIFIED` returned instead of claiming validation. The central-only console exposes integrity status without event payloads. New isolated PostgreSQL tests cover concurrent writers, outbox deduplication, transaction rollback, immutable records, fork prevention and fabricated digests.
- Local verification: API/admin TypeScript passed; 110 unit tests passed in 15 suites. New PostgreSQL/browser tests require remote results.
- Run 35630946205 confirms the dashboard redirects and chat selector are fixed, but found a chat token-read race in the browser test and a two-tab test that did not guarantee overlapping refresh calls. The corrections wait for session restoration and hold real network requests until both browser calls start; no responses are mocked.
- Completion `54d7c8884f3ad7c85faa9d0454c8fa359f122139` contains 384 paths; push run 35631840703 succeeded. PR run 35631855377 passed 110 unit, 191 real PostgreSQL integration, 16 browser, 22 mocked Flutter tests, Flutter analysis and live ClamAV. Its Android-only failure occurred after sign-in, three-generation search/tree, and two-reviewer claim approval, when the change-proposal button failed its hit-test after typing. The test helper now dismisses the native keyboard and checks/recalculates real scroll position for up to 30 rendered frames; this correction requires an actual Android rerun.
- Migration 015 adds a per-recipient inbox with unique event/recipient identity, persistent read state, allowlisted generic messages/destinations, bounded cursor pagination, category/in-app preferences and read-time chat membership/block checks. The notification worker records in-app history before external gateways. Member-only HTTP APIs, web inbox and Flutter inbox are implemented. Existing external gateway failures do not erase the member inbox. PostgreSQL/HTTP integration tests cover owner access, duplicate replay, cursor, preferences, all-read and provider failure. This new code has local TypeScript and unit checks; device, PostgreSQL and browser checks are still awaiting CI.

## Validation completed locally

- API and admin TypeScript typechecks passed after these changes.
- Full backend unit suite passed 108 tests in 14 suites after the chat/map changes. The final audit/map/chat focused run passed 10 tests in 3 suites after replacing the audit service.
- No PostgreSQL/Redis server, Flutter SDK or Android emulator is installed in this cloud workspace. Package setup through apt failed because the runtime cannot switch required system groups. This is separate from the user's Windows environment, which was not accessed.
- Remote PostgreSQL checks now passed all 9 chat (including WebSocket) and 7 household map tests. Flutter widget checks passed. The browser chat flow and final real-device checks still require passing results; these are separate acceptance tiers.

## Next execution steps

1. Inspect PR #5 head and its latest CI results, preserving unrelated newer remote changes if any. Chat/map/dashboard/audit are published. Check the corrected browser run and the restored M4/stacked PR Android checks.
2. For any unpublished corrections, use the actual remote parent tree. Local repository history was reconstructed from GitHub files: do not force-push this synthetic local history.
3. Run frozen-lockfile install, full typecheck, builds, backend unit/integration suites, browser tests, Flutter analysis/widget tests and Android live API acceptance. Resolve actual failures rather than rerunning failed commands blindly. Keep command, exit status and saved artifact for each tier.
4. Extend chat to complete group roles/management, media, reporting, delivered state and persistent offline outbox; verify reconnect pagination and load against NFR targets. Existing text chat is a checkpoint, not full CHAT-FR acceptance.
5. Complete community attachments, edits/history, threaded replies, keyword/safety policy and moderation appeals; household multi-member consent reconciliation and chosen map-provider rendering; remaining calendar invitation/recurrence workflows; notifications inbox/follows/broadcast; cultural CMS with approved content; S3 storage/media derivatives; import dry-run/commit tooling; offline caches/sync; account/role and operations consoles; complete locale externalization and accessibility.
6. Verify migration 014 and the audit chain in CI: shared transaction lock, canonical version-2 hashing, sequence ordering, rollback/outbox tests and central-only integrity console. Legacy records remain preserved and explicitly unverified; external checkpoint retention and complete event/access coverage still require acceptance.
7. Finish production-like security/load/device tests and backup/restore rehearsal. Production provider credentials, approved cultural rules/content, actual genealogical data and human release sign-offs must be supplied/approved before deployment. Do not invent or enable unavailable authoritative rules.
