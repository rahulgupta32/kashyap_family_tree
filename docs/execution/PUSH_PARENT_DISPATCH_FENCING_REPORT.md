# Push parent dispatch fencing

## Scope

The direct FCM path already records immutable per-device attempts and provider observations. A parent notification dispatch could still be finalized by an older initial, retry, or stranded worker after the provider reconciler had confirmed it as `SENT` or `SKIPPED`. The old write selected the parent by ID alone and could replace a confirmed result with an earlier `RECONCILIATION_REQUIRED` or `FAILED` result. Two retry paths also allowed a worker whose lease had been replaced to write its result over the new owner's work.

Initial processing now preserves a terminal push status when its late result arrives. Retry and stranded completion require the worker to own the current `PROCESSING` lease; their reported counts include only durable updates. Error updates use the same fences. The initial processing result is read from the persisted row when its update loses a race, so the outbox return value reflects a concurrent successful reconciliation. The change does not alter SMS/email delivery, claim duration, provider observations or the no-resend rule for ambiguous FCM outcomes.

## Verification

The real-PostgreSQL delivery-policy suite adds three cases for reconciliation winning against initial/retry/stranded completion, and two cases for a replaced worker lease. Each asserts that the persisted status/evidence stays with the winner; stale retry/recovery counts are zero. Local TypeScript typecheck and whitespace checks passed. This sandbox cannot connect to its PostgreSQL test endpoint (`EPERM 127.0.0.1:5434`), so the integration suite must pass in the exact-head CI before this batch is called verified. No provider or device was contacted.

## Remaining acceptance

This is a parent-status race fix, not provider receipt verification. Review-led remediation of `UNKNOWN`/`REJECTED` outcomes, live FCM/APNs credentials and handsets, operator paging, full load/failure acceptance, and the existing frozen release gates remain open. It authorizes neither automatic replay of uncertain attempts nor production deployment.
