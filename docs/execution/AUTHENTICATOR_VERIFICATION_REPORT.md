# Authenticator enrollment, session verification and recovery codes

Migration 040 adds account authenticators and session verification metadata.
Twenty random secret bytes are encrypted with AES-256-GCM and account-ID
associated data. Production startup requires MFA_ENCRYPTION_KEY containing a
canonical base64-encoded 32-byte key; development has an explicit development
key. This credential must be configured independently from JWT_SECRET, managed
through the production secret store, and backed up securely. Key rotation and
lost-key recovery have not been accepted for production.

TOTP uses SHA1, six digits and a 30-second step, accepting the current step and
one step in either direction. The account's last accepted counter is retained
under account serialization and row locking, so the same step cannot verify
another session. Five failed attempts lock the account's verification for 15
minutes, including attempts from other sessions. Failed-attempt increments
commit before a rejection is raised. Successful enrollment/verification and
recovery changes commit with audit evidence; audit failure rolls them back.

Enrollment is bound to the authenticated session and expires after ten minutes.
Confirmation issues ten random 128-bit recovery codes once, stores only SHA256
hashes, verifies the current session and revokes the account's other sessions.
Recovery requires phone authentication first and atomically consumes one code.
No OTP-only factor-reset, admin override or removal endpoint is provided.
Replacing a lost authenticator, regenerating backup codes, and independently
governed emergency recovery remain work. Do not discard the authenticator or
codes expecting phone login alone to recover privileged access.

All six authority roles require enrollment and verification in production.
Enrolled authority accounts are enforced in every environment. Unenrolled
fictional accounts used by existing non-production fixtures remain usable;
there is no configurable production bypass. Only exact bootstrap methods/paths
(factor operations, own profile and logout) permit an unverified session.
JWT claims do not confer verification. Stored session proof and account
generation must match; refresh copies that proof without extending the
previously implemented one-hour absolute privileged authentication age.
The existing WebSocket strategy calls use the same enforcement without a
bootstrap-path exception. Optional-auth public reads can fall back to anonymous
access, as they did before; they do not receive privileged authority.

The web portal routes a pending account to security verification on login and
session restoration. A security link supports voluntary non-production setup.
The manual setup key and one-time recovery codes stay in component memory;
session changes/unmount invalidate pending responses and clear those values.
Logout keeps route guards in a loading state through cleanup and final navigation,
preventing a transient sign-in form from being reset by a late logout redirect.
API factor responses have Cache-Control: no-store. The setup URI does not use
an external QR service. No dedicated native verification UI/device acceptance
has been implemented, so enrolled native authority accounts cannot complete
verification through the app yet; ordinary unenrolled member workflows remain.

Ten crypto/gate tests include all six RFC 6238 SHA1 test vectors, step replay,
account/key binding, ciphertext tampering, production key rejection and exact
bootstrap-path boundaries. Three real PostgreSQL HTTP cases cover enrollment,
other-session revocation, replay, concurrent recovery-code consumption, refresh
proof, account generation, attempt limits, pending-session ownership, audit
rollback, production enrollment enforcement and forged token claims. One live
browser workflow covers setup, recovery display, a new-session API rejection
and recovery through the UI. Exact-head CI evidence is recorded in PR #5.

This is additional independent authenticator verification after SMS login.
SMS and TOTP are both possession-based credentials, especially when used on
the same phone; this change does not claim distinct factor classes, phishing
resistance or any NIST assurance level. Stronger admin authentication, native
flows, lifecycle/governed recovery, deployed security testing, operational key
management and all signed production acceptance remain mandatory gaps.
AUTH-FR-012 and ADM-FR-001 remain PARTIALLY_COMPLETED; no acceptance closes.

References:
- RFC 6238: https://www.rfc-editor.org/rfc/inline-errata/rfc6238.html
- OWASP Multifactor Authentication Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
