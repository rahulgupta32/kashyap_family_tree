# Notification provider privacy hardening

## Problem and resulting behavior

The notification dispatcher logged recipient phone numbers on successful SMS, private message text during simulated push/email delivery, and arbitrary provider/transport exceptions during initial processing. Retry/recovery persisted raw exception messages in `error_message` and retry `provider_response`; Sparrow logged raw provider JSON and stack traces. These sources can contain echoed phone numbers, verification codes, credentials, private payloads or forged log lines.

Notification failure results and newly written delivery errors now use `NOTIFICATION_DELIVERY_UNAVAILABLE`. Worker/outbox logs use fixed unavailable codes. Success and simulation logs contain only fixed event names. SMS notification outcome metadata retains delivered/simulated status and a fixed provider classification; external provider names and message IDs are omitted. Sparrow rejection/transport boundaries return and log only fixed `SMS_PROVIDER_REJECTED` / `SMS_PROVIDER_UNAVAILABLE` codes. Neither raw response bodies nor exception stacks are logged by these paths.

Current account/category/channel authorization, durable inbox history, deduplication, retry counts, leases, exponential backoff and simulated-versus-delivered distinctions are preserved. External delivery still receives the authorized recipient/payload; this change limits operational metadata rather than replacing message delivery.

## Shared database boundary

Review also found SQL text, arbitrary database error messages/stacks and infrastructure names in shared database logs, plus raw errors in health results. Database logs now contain fixed connection/query event names, a finite allowlist of SQLSTATE diagnostic classes, and numeric slow-query duration only. Unknown/untrusted SQLSTATE strings become `UNKNOWN`. Failed startup throws a fixed connection error and remains unready; health failures return `DATABASE_UNAVAILABLE`. Query errors are still rethrown unchanged internally so constraint handling, transaction rollback and SQLSTATE-dependent application behavior remain intact. No SQL text/parameters or arbitrary server details are emitted by this service.

## Regression evidence

Six additional database unit cases verify error/stack/SQL redaction, unknown diagnostic rejection, useful constraint code preservation, slow-query duration without SQL, safe health failures and fail-closed/redacted startup. Ten new notification unit cases cover initial results/logs/persistence, failed and stranded retries, malicious success metadata, push/email HTTP status text and thrown transport errors, simulated payload logs, and Sparrow rejected/thrown responses. Three new real-PostgreSQL cases inspect stored initial/retry/stranded failure metadata, retry counts, released leases and retained retry timing. A fourth verifies that a real uniqueness violation retains SQLSTATE 23505 and the original stored record while logging neither the rejected private value nor SQL text.

Local API typecheck, the 315 existing unit tests plus sixteen new cases, release assessment/workbook validators and whitespace checking passed. PostgreSQL/browser/native/scanner/restore/search acceptance for the published source must be confirmed from its exact-head CI, recorded in PR #5. Local unit mocks are not provider acceptance evidence.

## Limits and production gates

This prevents new arbitrary provider-error metadata from these delivery paths. It does not alter or erase historical logs/dispatch records, immutable audit evidence, backup contents or third-party logs. A controlled incident/privacy review of historical operational data and approved retention/access policies remains necessary. Stable dispatch records retain internal IDs for diagnosis; omitted provider receipt identifiers reduce receipt-level troubleshooting until a reviewed opaque correlation contract exists.

Push-token registration/rotation/removal, provider invalid-token handling, real FCM/APNs integration, notification-versus-OTP SMS formatting and provider receipt acknowledgement remain unfinished. This report does not verify live provider contracts or change release acceptance classifications. All 260 final acceptance records remain open, including full load/scale, accessibility/iOS, managed secrets/TLS/infrastructure, monitoring, PITR/RPO/RTO and named source/privacy/cultural/release approvals. No merge or deployment.
