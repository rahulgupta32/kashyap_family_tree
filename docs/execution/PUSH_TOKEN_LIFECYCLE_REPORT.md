# Push registration lifecycle implementation

This additive batch resumes verified checkpoint `d69c3db1227de111bc2a180d8bdaf67c6e857f3b` on `feat/application-completion`. The frozen specification and acceptance decisions are unchanged. AUTH-FR-009 and native/provider notification acceptance remain partial.

## Implemented behavior

- Authenticated `PUT`, `GET`, and `DELETE /notifications/push-registration` operate only on the caller's server-created session family. Responses contain opaque registration metadata, never tokens or hashes, and use `Cache-Control: no-store`.
- Android/iOS platform must match the current session. Unknown input fields (including client user/session identity), malformed credentials, web sessions, revoked/expired sessions, inactive accounts, and expired privileged authentication are rejected. Authority is rechecked inside the mutation transaction using the existing family lock convention.
- Migration 056 creates an isolated registry. Legacy `devices.push_token` values are not promoted into authenticated registrations. Each family has one registration; a credential cannot belong to two active families. An ended/expired binding can be reclaimed with redacted retirement evidence. Every registration/rotation obtains a new generation; late invalid-token results cannot delete a newer generation.
- Credentials use AES-256-GCM with random nonces and authenticated registration/user/family/platform/generation context. `PUSH_TOKEN_ACTIVE_KEY_ID` and `PUSH_TOKEN_KEYS_JSON` form an independent managed 32-byte keyring. There is no default key or JWT/MFA-key reuse. Registration fails closed without usable keys; unrelated API startup and metadata/removal are available.
- Token changes and redacted audit intents commit together. Failed audit writes roll back credentials. Internal invalidation is generation-fenced, atomic, and idempotent. No public provider callback is exposed.
- The existing notification worker retires at most 50 stale registrations per cycle, independently of notification delivery. Cleanup rechecks eligibility under family locks; successful refresh retains its family. TTL is 30 days from registration/rotation. Removal is idempotent. Migration rollback refuses to discard a populated registry without an explicit drain.
- Fixed an existing refresh defect: refresh previously replaced every native platform with `web`. Successors now inherit their stored platform and device metadata; the HTTP regression refreshes through `/auth/native/refresh` and then registers again.

## Verification

Local API typecheck, API production build, all 378 unit assertions in 41 suites, release assessment validation (260 requirements/31 exact NFR targets), workbook mapping validation (14 sheets/195 columns), and diff whitespace checks passed before publication. The new unit suite covers encryption, context/tamper resistance, key rotation, fixed diagnostic messages, and input authority checks.

The new real-PostgreSQL/HTTP suite covers encrypted persistence, metadata isolation, active-token ownership conflicts, rotation, provider generation fencing, native refresh, idempotent removal, revocation/reassignment, retention, audit rollback, missing keys, concurrent ownership/rotation, and iOS session registration. Local PostgreSQL is unavailable; these assertions are not represented as passed until the exact-head GitHub Actions job verifies them. Existing CI automatically discovers this suite and migration.

## Outstanding mandatory work

- Connect the native notification SDK, permission changes, startup/sign-in registration, token refresh, sign-out removal, reinstall and account-switch flows. No real Android/iOS push delivery is claimed by this API batch.
- Connect gateway delivery to the registry, recheck account/session/audience/preferences at send time, and implement authenticated provider reconciliation, durable per-device idempotency and receipt semantics. The internal invalidation method is an adapter primitive; no unverified HTTP 2xx response is proof of native delivery.
- Provision managed keys with access controls and rotation/re-encryption monitoring. Retain historical keys until all affected registrations have rotated or expired; removing a required key makes decryption fail closed. Restore keys through an approved secret-management recovery procedure separate from database backups. Production secret custody/recovery is not verified.
- Add provider/native lifecycle metrics and paging, fleet/device and accessibility acceptance, full application/registered/realtime load evidence, governed workbook approvals and rehearsal, production TLS/secrets, PITR and measured RPO/RTO, privacy/cultural approvals, and named release sign-off.

PR #5 remains draft. No merge or deployment is authorized by these checks.
