# Durable mobile chat outbox

This checkpoint extends `edf09beb01d499d8eb7dfa1f1d27d81f1eeae1c9` on `feat/application-completion`. It adds encrypted local outgoing intent, recovery and queued-message controls to Flutter. Existing server idempotency is preserved. There is no schema change. The original 260 mandatory acceptance rows and historical implementation assessment remain unchanged.

| Requirement | Implementation added | Acceptance still open |
|---|---|---|
| CHAT-FR-007 | Persistent mobile queue, immutable retry ID/content, bounded retries and failure recovery | Durable browser outbox and full device/process-kill acceptance |
| CHAT-FR-006 | Service-recreation recovery and reconciliation against retained PostgreSQL messages | Complete history caches, pagination/reconnect gaps and retention |
| CHAT-FR-013 | Account/API-bound storage, session-safe replay, bounded queue, current server permission checks | Release-wide security/abuse/load acceptance |

## Behavior and boundaries

- Flutter saves each outgoing message to `flutter_secure_storage` before sending. Queue metadata binds one account subject and exact API URL; it contains no credentials. The JWT subject scopes local intent only; the server still authenticates and enforces current permissions on every send.
- Changing account or API clears a different-scope envelope before replay. If clearing/storage fails, sending fails closed. Logout/revocation clears the queue; changing session identity cancels further replay. Queue cleanup does not hold a network lock, so a 401 inside a queued send cannot deadlock on its own cleanup.
- Original UUID retry identity, conversation and content are immutable. One network pump and serialized local writes prevent overlapping flushes and lost enqueues. Concurrent account changes are checked before every HTTP send/retry; an old in-flight 401 cannot retry using a new account's token or clear that new session.
- Network errors, timeouts, 408, 429 and server failures keep intent and use exponential backoff from two seconds up to 60 seconds. Auth/permission/not-found/validation/conflict responses stop automatic retries and show a review state. Failed or delayed earlier intent blocks later intent only in that conversation; independent conversations may proceed.
- Foreground chat activates retry processing; pause/dispose stops further backlog replay. An already in-flight HTTP request may still commit. Its intent is retained if its outcome is uncertain, and the next attempt uses the same ID to reconcile safely.
- Queued/failed cards distinguish local intent from server Sent/Delivered/Read states. Explicit retry preserves original identity/content. Discard requires confirmation and cannot cancel an in-flight request or unsend an already committed message.
- The queue is limited to 100 messages, 4,000 characters each and 512 KiB serialized UTF-8. Full/corrupt/unavailable storage does not send or clear the composer as though persistence succeeded. Pending content has no automatic silent expiry; it remains until confirmed committed, explicitly discarded, logout/revocation or scope change. Android backup is already disabled.
- HTTP success must contain a committed message ID before local intent is removed. Storage failure after commit leaves the same ID for safe reconciliation. Replaying an already deleted committed message does not resurrect it.

## Verification

Local workspace typecheck, shared builds, all 133 API unit tests and the 260-row assessment validator pass. Real PostgreSQL and Flutter/device execution are delegated to exact-head GitHub CI because those runtimes are unavailable locally.

Thirteen new Flutter unit/HTTP tests cover persistence-before-send, storage failure, simulated committed-but-lost response and recreation, single-flight concurrent enqueues, backoff/per-conversation ordering, permanent permission/conflict failure, account/server scope changes including failed deletion, logout in flight, background stop, queue/corruption limits, discard restrictions, 401 cleanup without deadlock and cross-account 401 safety. The chat widget test verifies persistence/queued rendering, explicit retry identity and receipt transitions. Authentication tests inject an isolated queue store.

Two new PostgreSQL cases replay a persisted retry under a newly authenticated device session and prove deleted messages are not resurrected. The Android/live NestJS/PostgreSQL acceptance case now uses the real Keystore-backed queue and intentionally drops a real committed HTTP response, recreates the API/queue service, restores its original ID, retries, and verifies exactly one retained server message. This tests service recreation on a real device, not an OS process-kill campaign. Logout verifies both encrypted session and queue cleanup.

Published-head CI results are recorded in PR #5 after all jobs finish. Older delivery CI does not verify this outbox change.

## Remaining release scope

The web client still has an in-memory retry identity; a durable browser outbox remains open. Offline app startup without a refresh connection, full encrypted history caches, general synchronization/conflict recovery, all physical devices/process-kill cases and retention/load/security acceptance remain open. Queued messages are not pushed by an OS background worker. Chat media/moderation, cultural approvals and production provider/deployment gates remain mandatory. No merge, production deployment or signed Release 1 acceptance is claimed.
