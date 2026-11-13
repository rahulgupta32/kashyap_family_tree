# Authenticator lifecycle checkpoint

A currently verified authority session can renew recovery codes or replace its authenticator only after entering a fresh, non-replayed code from the current authenticator. Neither a phone OTP, a recovery code alone, client claims nor a stale session proof permits these lifecycle operations. Current account status, database authority, original one-hour authentication age and factor generation are rechecked inside the account-serialized transaction. Lifecycle routes are not bootstrap exceptions.

`POST /auth/mfa/recovery-codes/renew` replaces all recovery hashes, increments factor generation, cancels pending setup, revokes other sessions and updates current session proof atomically. It returns ten random once-displayed codes with no-store headers. The active authenticator secret is unchanged.

`POST /auth/mfa/replace/start` consumes a fresh current-authenticator counter and creates an encrypted ten-minute pending key bound to the current session. The old key remains active until confirmation. `POST /auth/mfa/replace/confirm` verifies the pending key, replaces the active key, issues a new recovery-code set, increments generation and revokes other sessions. Expired/superseded setup and other sessions cannot confirm. Existing migration 040 fields suffice; no migration or historical factor reset is performed.

Factor updates, proof, revocations and audit intent share the transaction. Audit failure rolls everything back. Competing confirmations serialize, with one success and one stale conflict. Attempts use existing five-failure/15-minute controls. Audit payloads contain only event/generation, never setup keys or recovery codes. Existing refresh proof and original authentication-age policy remain.

Web and mobile security entry points expose fresh-code renewal/replacement, clear setup/code material after acknowledgement and keep sensitive material in component/route memory. Expired setup can restart; replacement requires another fresh current-authenticator code. Native required-verification routes still return to the application after verification, while an explicitly opened security-management route remains available for credential management.

Two PostgreSQL regressions cover renewal, old-code/session invalidation, spoofed fields, session-bound replacement, audit rollback and competing confirmation. Two native widget regressions cover renewal acknowledgement and the replacement-confirm endpoint. The live browser authenticator scenario also renews codes and replaces a key. Existing Android setup/challenge/recovery/restoration acceptance remains; dedicated lifecycle device and iOS acceptance remain open.

Local typechecks, 197 unit tests and release-ledger preservation passed before publication. Production builds and exact-head full CI are recorded in PR #5; pending until that run completes.

Governed emergency recovery when the authenticator is lost, stronger distinct-factor administrator authentication, key backup/rotation/lost-key recovery, full bilingual/accessibility/device/security/production acceptance and all other mandatory release requirements remain open. SMS/TOTP are both possession credentials; no phishing-resistant or NIST-level assurance is claimed. No signed acceptance, merge or deployment.
