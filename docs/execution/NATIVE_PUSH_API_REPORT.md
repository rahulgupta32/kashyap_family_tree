# Native push registration transport

This batch advances AUTH-FR-009 and NOT-FR-005 within the accepted Flutter architecture. It does not close any of the 260 frozen acceptance gates or change approved requirements.

## Implemented

- The mobile API service exposes authenticated register, inspect and remove operations for `/notifications/push-registration`. Registration sends only the provider token and uppercase native platform. Input length, alphabet and platform follow the server contract; credentials are not stored locally by these methods.
- Push operations bind to a local session generation. A replacement login, restored session, explicit authentication replacement or cleared session prevents an outstanding push request from retrying under the replacement session. Access-token rotation within the existing session remains supported.
- Refresh responses are also generation fenced: a refresh begun under an older session cannot overwrite replacement credentials or resume an old push registration. Server authorization and session-family checks remain authoritative.
- Failure messages expose status codes, not server error bodies or provider credentials. Malformed JSON produces a fixed error.
- Six mock HTTP regression tests cover iOS metadata, the three operations, invalid inputs/missing authentication, same-session refresh, replacement-session races before and during refresh, and error-body redaction. These are transport tests, not notification SDK or physical device acceptance.

## Verification

Release assessment and frozen workbook mapping validators passed locally; `git diff --check` passed. Flutter is unavailable in this execution container. Flutter analysis and tests, Android integration checks, and the existing API/database/browser/storage/restore/benchmark checks must be observed on the exact pushed commit in GitHub Actions. The PR checkpoint records those results only after they complete.

## Remaining gates

These API methods are not automatically invoked by the app. Managed Firebase configuration, notification SDK integration, explicit notification consent/permission changes, token-refresh subscription, startup/sign-in synchronization, permission withdrawal, reinstall/account-switch flows and real Android/iOS/APNs delivery remain OPEN. Server logout already revokes its session family and associated registrations; offline or failed server logout is not claimed as confirmed revocation.

Provider recovery remains governed and must not blindly resend uncertain outcomes. Production alert ownership/routing, full API/realtime load tests, independent security/accessibility acceptance, approved data imports and cultural source approvals, physical native-device acceptance, and production backup/PITR/key recovery with measured RPO/RTO remain release blockers. No merge or deployment is authorized by this evidence.
