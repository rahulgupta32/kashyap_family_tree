# Direct FCM provider and durable reconciliation journal

Continues verified checkpoint `907f68d2a6450eb3ee692fc9021e11984847ce1b` on `feat/application-completion`, PR #5. Frozen specifications, ADR-012 provider ports, requirement classifications and import approvals remain unchanged.

## Implemented

- An in-process FCM HTTP v1 adapter behind an injected provider port. Fixed Google OAuth/FCM destinations, RS256 assertions with the messaging scope, short-lived credential-bound access-token cache, bounded streamed responses, eight-second request deadlines, and redirect refusal. Managed service-account configuration is loaded only when used; unrelated startup remains available without push credentials.
- FCM receives the device token, a generic bilingual notification, and dispatch identity. Family details and saved event payloads are excluded. Provider receipt names are retained only as SHA-256 hashes; upstream diagnostics are not persisted or logged.
- Migration 057 freezes a per-dispatch registration/generation roster. Atomic one-shot device claims and append-only provider observations prevent retransmission after ambiguous responses, expired claims, token rotation, or lost database acknowledgements. Unknown/rejected attempts remain `RECONCILIATION_REQUIRED`; this is a hold, not success.
- Current account, preference, session family, token generation and event audience are checked before delivery and again after OAuth. Typed FCM `UNREGISTERED` responses invalidate only the captured generation, with deletion, observation and redacted audit intent in one transaction.
- Bounded reconciliation uses committed positive provider proof without calling FCM. `SENT` retains its existing parent-dispatch meaning of provider acceptance; it never establishes device delivery. Late positive observations can resolve an expired claim. Unobserved devices prevent confirmation of a multi-device parent.
- Production refuses the legacy user-ID gateway and simulation. Development-only gateway behaviour is preserved. Enable the adapter explicitly with `PUSH_PROVIDER=fcm` and managed `FCM_SERVICE_ACCOUNT_JSON`; do not commit service-account keys.
- Populated migration rollback and evidence mutation are refused. The disposable logical restore rehearsal includes provider proof, unobserved holds, reconciliation without retransmission, immutable triggers and rollback protection.

## Verification scope

Added mocked-network unit tests for OAuth signatures, scope/destinations, privacy, malformed acknowledgements, token errors, response bounds, redirects, revocation and cache rotation. Added real-PostgreSQL integration tests for concurrent claims, uncertain outcomes, generation fencing, revocation, audit rollback, lost commit acknowledgements, late proof and immutable evidence. These database tests and the restore rehearsal require the isolated GitHub CI services; merely adding them does not establish a pass. Exact-head CI and observed counts are recorded in PR #5 after completion.

## Remaining release gates

Live FCM credentials/IAM, real-device SDK token registration and refresh/logout wiring, iOS APNs integration and physical-device delivery/background checks remain open. This batch intentionally holds HTTP 429/503 and other rejected/unknown attempts; reviewed recovery/retry tooling, provider incident procedures and alert routing still require implementation and acceptance. No automatic resend can infer safety from an unknown outcome.

Production telemetry/alert routing, full HTTP/realtime workload acceptance, registered-load targets, independent security review, accessibility/device acceptance, approved real-data import, managed-key recovery, encrypted offsite backup/PITR and measured RPO/RTO remain open. A fictional logical restore does not prove production disaster recovery. No merge or deployment is authorized by this report. All 260 final requirement acceptance gates remain open until evidence and approvals satisfy the frozen release assessment.

Protocol references: [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [FCM error codes](https://firebase.google.com/docs/cloud-messaging/error-codes), [Google service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account).
