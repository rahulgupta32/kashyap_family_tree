# Application completion checkpoint

Updated 2026-09-21. Preserve M1–M4 protections, user D: storage, backups and unrelated workloads. Do not merge either pull request or deploy production from this checkpoint.

## Remote state and evidence

- M4 PR #4: `feat/m4-governed-workflows` → `develop`; last inspected head `dafc7b1039b44bc73996c27b2a97c0e7737c0240`. Its last change removes an Android test scroll-animation wait that could deadlock without frame pumping. No Actions run was found for that newest head during inspection.
- M4 verified checkpoint `8bfe0fbb943523fb351d2c73db0651d48c61b88e`: PR run https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567 passed platform, Flutter, live ClamAV and real Android/live API/PostgreSQL acceptance. See M4 delivery report for the exact evidence scope.
- Draft completion PR #5: `feat/application-completion` → `feat/m4-governed-workflows`, community checkpoint `2c3cba954ea25782718a6885cbee0c7f0aa17599`. Push run 35514808157 and PR run 35514832719 both passed.
- Created GitHub chat commit: `a279f204bc0f2b61d8787ac8ca5a255266d9b9ff`; tree `fc0ec6f459dc76c17941c75a3ae041aad3b70640`; parent `2c3cba954ea25782718a6885cbee0c7f0aa17599`.
- The earlier automatic approval-review usage block cleared on 2026-09-21. After rechecking the remote head, a normal non-forced update published the chat commit to `feat/application-completion`. Local map/dashboard/audit recovery commit: `64a0912`. Do not claim remote verification until the new runs finish.

## New local work

1. Migration 012 and persistent chat API: direct-pair uniqueness, explicit branch-group membership, idempotent sends, bounded history cursors, read receipts, sender deletion, blocking, current-session WebSocket authentication, Redis typing expiry and private notification triggers. Web and native Flutter screens and tests added.
2. Migration 013 and household map: separate governed location entity; explicit reversible consent; independent branch review; profile/family/minor protection intersection; only coordinates rounded to 0.1° are saved. Public clusters require at least three consenting eligible households and fixed district cells. Query bounds filter generalized output, not private coordinates. Account deletion withdraws consent. Web and Flutter locality views and editing added.
3. Dashboard uses actual role-scoped counts instead of demo numbers. Audit browsing now reads PostgreSQL metadata with central authority, pagination and bounded parameterized filters; no fake in-memory audit trail is returned.
4. `RELEASE_ACCEPTANCE_LEDGER.csv` extracts all 229 functional and 31 nonfunctional requirements from the frozen master specification. All remain in mandatory Release 1 scope. Status is deliberately not inferred solely from a module test count.

## Validation completed locally

- API and admin TypeScript typechecks passed after these changes.
- Full backend unit suite passed 108 tests in 14 suites after the chat/map changes. The final audit/map/chat focused run passed 10 tests in 3 suites after replacing the audit service.
- No PostgreSQL/Redis server, Flutter SDK or Android emulator is installed in this cloud workspace. Package setup through apt failed because the runtime cannot switch required system groups. This is separate from the user's Windows environment, which was not accessed.
- Added tests are not the same as passed tests: new chat WebSocket/PostgreSQL tests, map PostgreSQL tests, browser chat scenario, Flutter chat and map widget tests still need execution. Their outputs must be recorded before marking acceptance complete.

## Next execution steps

1. Inspect PR #5 head and its latest CI results, preserving unrelated newer remote changes if any. Chat is published; check whether the subsequent map/dashboard/audit checkpoint has finished verification.
2. For any unpublished corrections, use the actual remote parent tree. Local repository history was reconstructed from GitHub files: do not force-push this synthetic local history.
3. Run frozen-lockfile install, full typecheck, builds, backend unit/integration suites, browser tests, Flutter analysis/widget tests and Android live API acceptance. Resolve actual failures rather than rerunning failed commands blindly. Keep command, exit status and saved artifact for each tier.
4. Extend chat to complete group roles/management, media, reporting, delivered state and persistent offline outbox; verify reconnect pagination and load against NFR targets. Existing text chat is a checkpoint, not full CHAT-FR acceptance.
5. Complete community attachments, edits/history, threaded replies, keyword/safety policy and moderation appeals; household multi-member consent reconciliation and chosen map-provider rendering; remaining calendar invitation/recurrence workflows; notifications inbox/follows/broadcast; cultural CMS with approved content; S3 storage/media derivatives; import dry-run/commit tooling; offline caches/sync; account/role and operations consoles; complete locale externalization and accessibility.
6. Reconcile immutable audit hash writer concurrency and legacy-chain verification rather than claiming the metadata browser proves hash-chain integrity.
7. Finish production-like security/load/device tests and backup/restore rehearsal. Production provider credentials, approved cultural rules/content, actual genealogical data and human release sign-offs must be supplied/approved before deployment. Do not invent or enable unavailable authoritative rules.
