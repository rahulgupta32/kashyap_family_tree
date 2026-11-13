# Profile session and notification lease boundaries — 30 October 2026

## Published source and runtime evidence

The independently retrieved recovery ZIP matched the owner's exact 27-file authorization. The approved manifest was `d7fc2b70906e6b4aea9b95c0593afad80e4a15ff3b7bd4da3646d09a4b96a37a`; the approved PR body was `296265c35190149322ce0c582e49b6deb8588e820db3e782059cb8052a59b1d8`. Publication succeeded through the existing GitHub workflow without force. Connector-assigned metadata maps original `da3151f` to `bc6e38794d2ce9f7a350dfb83e04cd58b954dbbe`, then original `20d4e86` to `1fd1121f0c357faaacc9f3dd28fa60ce2f643e16`. Both reviewed trees were preserved; the final tree is `4876b0ae9b1d1a7fe5535cca538e6cf0f6e9638b`. Fetch, tree comparison, Git fsck and a separate fresh GitHub-only clone verified all 27 changed-file hashes. Original commit identities remain recoverable in the private bundle.

On that exact published source, main CI `41080111695` platform job `124146637334` passed 650 unit tests, 600 actual PostgreSQL/Redis integration tests, migration 067, 87 browser tests and the receipt/closure restore rehearsal. Ten general-suite S3 skips were covered by the successful dedicated storage job. Scanner and search jobs passed. Flutter job `124146637828` passed analysis and 322 tests. iOS `41080111346`, job `124146638567`, passed simulator startup, nine real Keychain/startup markers and unsigned device compilation. This is not physical-device, signing, provider or live-backend iOS acceptance.

Android job `124146637656` passed three actual journeys: M4 workflows including claim correction, MFA and account deletion. The fourth dispute journey failed with `StateError: No element` while scrolling for the Open card at test line 571 after an asynchronous recovery action. Artifact `12989831513` was downloaded and its ZIP digest verified: `75a1e3d25053fc65384e94d4ef86846eafc747e7a8ab76c9883630ee1df99445`. Its API log confirms PostgreSQL 16.15, Redis 7.4.12 and migration 067, with no handler exception around this failure.

The fixture now requires authoritative clearance of the pending intent, brings the list's loading indicator into view and settles the reload before looking for the lazy Open card. The existing 30-second waits, three-minute case deadline and all business assertions remain. This correction requires actual new-source emulator evidence; the fourth journey remains unaccepted.

## Profile form isolation

The profile screen retained no originating API/session generation. Replacing account A with B could leave A's private address, biography, avatar and settings displayed, and Save could submit A's form under B's credentials. The screen now captures its API and session generation, clears private state synchronously on session changes and expires on API replacement. Load, save, dropdown and deletion callbacks revalidate that boundary. Late responses cannot restore old data or alter the replacement form. Editing is disabled during save and diagnostics are generic.

Seven widget regressions deliberately bypass transport fencing with fake callbacks to test the UI boundary itself. They remain unexecuted locally. An existing HTTP 503 fixture now supplies explicit test authentication so it continues testing authenticated load failure and retry without weaker assertions. Relevant frozen records are PROF-FR-005/006, AUTH-FR-005 and EC-0259; full independent acceptance remains open.

## Notification retry ownership

Retry and recovery workers previously claimed 50 jobs for 60 seconds but delivered them sequentially. Later jobs could lose ownership while queued and still call a provider. Six behavioral regressions failed on the published source. Workers now claim one job immediately before processing, with a unique token per claim and a 50-job cycle bound. Active ownership is checked after current eligibility and again after SMS recipient lookup. Delayed FCM authorization carries the same fence.

An interim expiry predicate on final writes failed two slow-success controls: it discarded a known successful outcome and could cause an avoidable resend. Final known outcomes now require the same claim token and PROCESSING state, allowing an unreplaced late acknowledgement while atomically protecting replacement claims. Ten focused lease tests cover these boundaries; six real PostgreSQL counterparts are prepared. Existing mocks now model actual claim/lease behavior. One mock typing error was fixed without weaker assertions.

This correction does not promise exactly-once external delivery. The initial inline PENDING path and ambiguous in-flight provider outcomes remain outside this bounded fix. Provider reconciliation and production operational acceptance are still required. Relevant frozen records are NOT-FR-008/011.

## Follow-on verification and release limits

Pinned pnpm 9.15.9 frozen installation and shared builds passed. API typecheck and build passed. The corrected backend passed all 660 unit tests across 61 suites; the focused notification run passed 44 tests across four suites. Frozen requirement, release and workbook validators and whitespace checks passed. Seven new widgets, six new PostgreSQL cases, corrected Android and updated browser/native/restore execution remain pending source-bound CI. Parent results do not validate changed code.

The accessible repository-linked staging inventory returned zero projects; no approved target, service access, budget or deployment was established. The local runner maps only UID 0 and has no PostgreSQL, Redis, Flutter or container binaries. Existing CI supplies approved real services without bypassing isolation.

PR #4 remains open into develop; PR #5 remains draft on its M4 base with no submitted reviews. All 260 signed requirement acceptances remain open, as do RG-01 through RG-12. Production remains NO-GO. Remaining work includes mandatory F1–F6 journeys, independent security/privacy/accessibility/localization/load/UAT, approved data and cultural inputs, signing/live providers/physical devices, PITR/rollback/monitoring and Jyphra release approval. No merge, production deployment, real-data import, unapproved cultural activation or store submission occurred.
