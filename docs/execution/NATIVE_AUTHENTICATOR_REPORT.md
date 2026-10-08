# Native authenticator verification

The Flutter entry route checks `/auth/mfa/status` after phone login and secure-session restoration. Each status check clears the previous status before awaiting a response. Failed status reads offer retry and keep signed-in screens closed. The server determines required enrollment and proof; the client does not infer authority from token claims. A protected request denied with `MFA_REQUIRED` rebuilds the session route so current policy is checked again.

Required accounts can enroll a time-based authenticator using a manual key, confirm a six-digit code, save ten once-displayed recovery codes, and verify future sessions with either an authenticator code or a one-use recovery code. Setup material and recovery codes remain in route memory and are cleared on continuation/disposal. The app does not persist them or call external QR services. Server encryption, replay protection, attempt limits, original session age and current permissions remain authoritative.

Five widget regressions cover status failure/retry, recovery verification with a server recheck, enrollment with recovery-code acknowledgement, failed proof recheck without stale controls, and expired setup restart. Existing real API/device suites remain regression evidence; dedicated live authenticator/device and iOS acceptance remain open.

This adds a native path for required verification, not voluntary enrollment for otherwise unrestricted development accounts. Governed emergency recovery, factor replacement, recovery-code regeneration, production encryption-key operations, distinct-factor administrative authentication, bilingual/accessibility acceptance and deployment security validation remain unfinished. No signed acceptance is closed and no production readiness is claimed.

## Verification and publication status

Local release-assessment validation and `git diff --check` passed. Flutter is not installed in this workspace; analyzer and widget/device regression verification run in GitHub Actions. Publication and exact-head CI are pending. Expired or superseded enrollment can be restarted with a fresh manual key.
