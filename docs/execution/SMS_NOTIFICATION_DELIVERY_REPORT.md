# Separate notification SMS and bounded delivery

## Problem and resulting behavior

The notification dispatcher used `sendOtp`, causing the Sparrow adapter to wrap a bilingual event notice in verification-code instructions. It now requires `ISmsProvider.sendNotification`; Sparrow sends the authorized notice unchanged, while authentication and profile verification still use the existing OTP template. There is no fallback from notification delivery to OTP delivery.

The nonproduction adapter explicitly simulates notification delivery without adding notification content to authentication OTP inspection history. Construction and execution remain prohibited in production. Provider metadata remains redacted by the preceding privacy hardening.

Both Sparrow methods share a request implementation using the existing HTTPS form endpoint/contract and an eight-second AbortController deadline. The deadline includes response-body consumption and is cleared in `finally`. HTTP acceptance still requires the existing successful provider response code; malformed/rejected responses fail closed, and transport/abort errors use fixed unavailable metadata. No live provider was contacted by verification.

Notification worker wakeups now skip when a cycle is already running. A failed cycle logs a fixed code and releases the busy state. Shutdown stops future ticks and awaits the active cycle; repeated initialization does not register duplicate timers. This is process-local coordination, not a distributed exactly-once delivery guarantee.

## Verification

Local API TypeScript checking, all 343 unit tests, frozen release/workbook validators and whitespace checks passed. Nine new SMS cases cover correct OTP/notification text, bilingual form encoding, request/response-body deadlines, timeout cleanup, malformed receipts, simulation-history separation and production rejection. Three lifecycle cases cover overlapping wakeups, failure recovery and shutdown draining.

Two additional real-PostgreSQL cases use the actual Sparrow adapter with intercepted HTTP, checking correct generic chat notification text, absent private chat body/OTP instructions, durable accepted outcomes, redacted provider rejection and successful retained-job retry. Existing PostgreSQL delivery-permission/revocation and provider-privacy tests now explicitly assert the notification method never invokes OTP delivery. These cases require exact-head CI confirmation, recorded in PR #5; HTTP interception does not prove provider acceptance.

## Limits and required production evidence

Commercial credentials, registered sender identity/templates, Unicode segmentation/cost/delivery receipts and real handset/provider acceptance remain release gates. The eight-second timeout means an unconfirmed request may have been accepted externally; retries can duplicate an alert until an approved provider idempotency/receipt-reconciliation contract exists. Notification records retain internal identity/deduplication, but this change does not promise externally exactly-once delivery.

Worker cycles remain sequential, with existing batch/retry bounds and database leases. Fleet ownership, outbox claim concurrency, crash recovery, shutdown ordering/grace periods, throughput/backpressure, alerting and production load acceptance need further evidence. Awaiting one process's active cycle does not establish safe fleet shutdown.

Push-token registration/rotation/removal, invalid-token handling and live FCM/APNs integration remain unfinished. All 260 final acceptance records and existing requirement classifications remain open/unchanged. Full production workload, accessibility/iOS, approved import promotion/cultural sources, monitored operations, managed PITR/RPO/RTO and named release approvals remain mandatory. No merge/deployment.
