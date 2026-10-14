# Calendar creation retry identity

## Contract and transaction

`POST /calendar` and `/calendar/events` accept optional `creationKey` (UUID). A key belongs to the authenticated account and CREATE_EVENT operation, never a caller-supplied account. Both aliases share the same operation. Existing unkeyed callers remain compatible; they have no lost-response deduplication guarantee.

Migration 059 reserves `(account_id, operation, creation_key)` in the same repeatable-read transaction as the event, invitations, revision, audit/outbox intent, notification recipients, audience preview consumption and reminders. SHA-256 over recursively key-sorted JSON excludes the key; array order remains significant. Only a fingerprint, account, key and event reference are stored in the receipt. Changed payload returns 409. Deferred commit checking forbids an empty result; finalized receipts are immutable and have no expiry. Downgrade refuses retained evidence.

A successful replay rechecks active account and original scope authorization, then returns the current owned event without creating another revision, consuming another preview, recording another notice or rescheduling reminders. This precedes time-sensitive first-create validation, so a consumed preview or elapsed scheduled time does not prevent recovering an existing result. Current event management/privacy logic is preserved; no recipient roster is returned to another account. Concurrent INSERT conflicts under repeatable read cause complete transaction retries for 40001/40P01, at most three attempts. Rollback removes both reservation and effects; an unconfirmed commit remains retryable with the original identity.

## Native lifecycle

One immutable pending payload/key is captured before HTTP. Native credential storage contains that intent in the same serialized secure record, bound to server/account. Refresh preserves it; restored credentials restore it before refresh. Account replacement/logout clear it. Every send is session fenced and additionally account bound when an account identity is available. Storage failure prevents initial send; acknowledgement-cleanup failure retains the original identity. Legacy access-token-only callers have memory preservation, not process durability.

The ordinary dialog freezes its fields after first submission. Save retries the original intent, even if its former audience preview has since expired. Closing/navigation does not discard that intent; the calendar + action resolves it before opening another draft. A successful acknowledgement must contain an event ID before intent cleanup. One unresolved request blocks a second create. A permanent rejection therefore needs a future explicit safe-resolution workflow; this implementation deliberately does not silently replace an uncertain identity. Admin currently remains an unkeyed caller and needs separate adoption. These are open limits, not completed production behavior.

## Validation and limits

- PASS: shared package TypeScript compilation, API typecheck and compilation.
- PASS: 425 unit cases in the broad run and all nine cookie-origin cases on focused rerun after fixing the local missing Express link; five new retry-contract cases included. No application source/assertion was weakened for the local dependency issue.
- PASS: frozen matrix/release/workbook validators; ten matrix integrity negatives; five workbook regressions; whitespace.
- PostgreSQL delivery/audience suites attempted: both failed fixture setup because localhost:5434 refused connections; none of 29 assertions executed. Six new cases cover lost response/reconstruction/effects, account/conflicting key, concurrent retries, rollback, receipt integrity/downgrade and consumed genealogy preview replay. Local package acquisition also encountered a network failure. Exact-source CI is required.
- Nine new Flutter cases cover secure pre-send persistence/reconstruction, immutable payload/account replacement, storage failure, cleanup failure, token refresh, concurrent/stale acknowledgement fencing, malformed acknowledgement, owner/server rejection and navigation retry. Existing composition/privacy fixtures now expect a retry key and real event-ID acknowledgement. Flutter/analyzer unexecuted locally: SDK unavailable, pinned download returned 404.
- Parent 995a52107db47af930255e53459178cd9a259216 has independently retrieved successful CI38604748504 and native38604748496. New source inherits no green result. Exact SHA/tree/automatic run IDs and actual statuses are recorded in PR #5 after publication.

No merge/deployment or release acceptance. Physical secure-storage durability, device/signing/live providers, distributed operational recovery, remaining functional/NFR/privacy approvals and all 260 final acceptance records stay open.
