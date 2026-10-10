# Chat delivery acknowledgements

This checkpoint extends `05f5a224e8831ed44754a7997e8fbfbad63a5042` on `feat/application-completion`. Migration 021 stores exact per-message/per-account acknowledgements. Release 1 acceptance and the original 260-row ledger remain open. The source assessment at `0d93525` is a historical baseline, unchanged by this delta report.

| Requirement | Implementation added | Acceptance still open |
|---|---|---|
| CHAT-FR-005 | Durable sent/delivered/read lifecycle, HTTP/WebSocket acknowledgements and web/Flutter rendering | Full multi-device matrix, receipt preference policy and load acceptance |
| CHAT-FR-006 | Delivery receipts survive re-login and are shared across account sessions | Reconnect gaps exceeding the 100-message snapshot, retention and full sync acceptance |
| CHAT-FR-013 | Bounded batches, current authorization, exact conversation/history validation, atomic writes | Release-wide security and abuse/load acceptance |

## Semantics

- Sent means PostgreSQL committed the message. Delivered means an authenticated client acknowledged that specific received record, or the account already acknowledged reading it. Neither a WebSocket server write nor an external push-provider status counts as delivery.
- `POST /chat/conversations/:id/delivered` accepts only `messageIds` (1–100 distinct UUIDs). The WebSocket `delivered` frame uses the same service. Identity comes from the authenticated session. Missing, foreign-conversation and pre-membership-history IDs reject the entire batch; no partial receipt is written.
- Delivery alone never changes read cursors or unread counts. First delivery time is preserved by a unique message/account key and conflict-safe insertion. Concurrent devices share durable evidence.
- Read remains the existing cumulative account acknowledgement through an authorized message sequence. It implies delivery through that sequence. Zero is a no-op; lower valid cursors do not regress state. A cursor in another conversation, a sequence gap, a future message or pre-restoration private history is rejected.
- Returned receipt identities include only current active participants with access to that message's history boundary. Removed/left members' old receipts are hidden; restoration does not expose or acknowledge their earlier private-group history.
- Own messages show Read when at least one other current participant has read them, otherwise Delivered when at least one has acknowledged receipt, otherwise Sent. Group status means at least one eligible recipient, not all group members. This preserves the existing read-state product convention.
- Web tabs acknowledge received socket records even when hidden; reading requires a visible tab and is acknowledged on visibility restoration. Flutter acknowledges received records while connected; reads require the foreground conversation route. Background lifecycle closes the connection.
- Deleted records remain tombstones and may be acknowledged without recovering their content. Receipt data contains identifiers/timestamps and no message text.
- Migration backfills delivery only from existing read evidence. Rollback refuses unread delivery evidence; read-only delivery can be reconstructed from existing read cursors. Export timestamps before rollback if their exact timing must be retained.

## Verification

Local shared-package builds, workspace typecheck, NestJS/Next.js production builds and 133 API unit tests pass. Playwright discovers all 22 browser cases; the updated real-browser chat case exercises hidden-tab Delivered, unchanged unread state, visibility-restored Read and deletion. The Flutter mocked transport test renders Delivered then Read and verifies explicit message-ID acknowledgements and retry identity.

Eleven new disposable PostgreSQL cases cover no inference from sends/GETs, exact acknowledgements, concurrent idempotency, invalid/spoofed batches, atomic foreign-ID rejection, read implications, another real session, removal/restoration boundaries, account suspension/role revocation, tombstones and guarded rollback. The existing real WebSocket case now verifies Delivered before Read.

Delivery head `edf09beb01d499d8eb7dfa1f1d27d81f1eeae1c9` passed [PR CI 37121838079](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/37121838079): 133 unit, 249 real PostgreSQL integration, 22 browser and 28 Flutter tests, zero analyzer issues, live ClamAV and Android/live API/PostgreSQL. No local PostgreSQL or Flutter result is claimed. Later mobile-outbox work is tracked separately in `CHAT_OFFLINE_OUTBOX_REPORT.md` and requires its own exact-head CI.

## Remaining work

Durable offline outbox, chat media, reporting/moderation, reconnect/pagination gaps and retention remain separate blocks. Receipt opt-out policy is not yet specified/implemented; this checkpoint uses the existing account-shared read-receipt convention. Production push delivery is separate from in-app delivery acknowledgements. No exceptional administrative access, production deployment, merge or signed Release 1 acceptance is claimed.
