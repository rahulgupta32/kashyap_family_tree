# Durable browser chat outbox

This block extends verified mobile outbox head `80e74e24dda2c90940703b8a57f2ee7e9d566a8e` on `feat/application-completion`. It adds outgoing browser persistence for CHAT-FR-007 and bounded recovery for CHAT-FR-006/013. No schema or original acceptance-ledger change is made.

Browser chat saves immutable UUID, conversation and content before sending. IndexedDB holds an AES-GCM encrypted envelope with a nonextractable Web Crypto key, random IVs and authenticated account/API/epoch metadata. Credentials are not stored in the queue. This protects persisted content from casual plaintext inspection, not from code executing in the same origin: the browser can use its stored key. Secure context, IndexedDB, Web Crypto and Web Locks are required; unavailable/full/corrupt storage fails closed and preserves the composer.

A storage lock serializes encryption and writes across tabs; a separate pump lock prevents concurrent replay. Pending content survives reload and remains visible before reopening a conversation. Only online, visible chat pages pump the queue; there is no background worker or offline page shell. Successful server responses must include a message ID before removal. Lost responses and aborted sends retain the original retry ID, using existing PostgreSQL idempotency to reconcile without duplicating or resurrecting deleted messages.

Network, timeout, 408, 429 and server failures back off from two to sixty seconds. Permanent permission/validation/conflict failures stop automatic retries. Earlier delayed/failed intent blocks its conversation but allows independent conversations. Retry retains identity and content; discard requires confirmation and cannot run while any tab owns the network pump. Discard removes local intent and cannot unsend an uncertain server commit. Queue limits are 100 messages, 4,000 characters each and 512 KiB serialized UTF-8.

Local subject is a storage scope only; every send still requires current server authentication and permissions. Account/API changes clear foreign envelopes before replay. A local generation invalidates old pumps immediately during logout/revocation without waiting on network locks. Late refresh responses cannot restore an invalidated generation. Network/503 refresh outages retain local intent; confirmed 401/403 refresh rejection clears it. Pending intent has no silent expiry.

## Verification

Local monorepo typecheck, production admin build, Playwright collection and 260-row assessment validation pass. Four real Chromium scenarios exercise committed-but-lost HTTP responses, encrypted persistence, reload during refresh outage, cross-tab replay with exactly one PostgreSQL message, permanent rejection/discard, cross-tab logout purge, and failed IndexedDB writes preserving the composer with no POST. The existing browser messaging test continues to validate server receipt behavior.

Full PostgreSQL/browser, Flutter, live ClamAV and Android/live API acceptance runs in GitHub CI; exact published-head results are recorded in PR #5. Earlier mobile CI does not verify this browser change.

History caches, reconnect gap recovery, broader browser/device/process-kill coverage, queue load/security acceptance, offline startup, general conflict synchronization, chat media/moderation and all production/cultural approvals remain open. All 260 original release acceptance rows remain `ACCEPTANCE_NOT_CLOSED`. No release completion, merge or deployment is claimed.
