# Mobile authenticated request session fence

## Problem and implementation

The previous verified checkpoint fenced push registration and account-bound chat operations, but most mobile HTTP requests did not bind to a session generation. A delayed 401 could therefore trigger a retry of an older request using replacement native credentials. A delayed successful private response or MFA denial could also be delivered after a session replacement.

All authenticated requests through the shared mobile transport now capture a session generation by default. The transport checks it before dispatch, after receiving a response and after refresh/retry. Replacement sign-in, restored session, explicit token replacement and clearing invalidate outstanding requests. Refresh rotation in the same session preserves its generation and the existing coalesced refresh flow. Server authorization, session-family validation and account-bound request checks remain authoritative.

No attempt is made to undo an operation already committed by the server. This fence prevents the client from replaying an older operation under replacement credentials or accepting its late HTTP result. It does not claim a full cache/UI isolation audit or physical-device security acceptance.

## Regression coverage and verification

Six new mock-transport cases cover delayed success/401/MFA responses, an older PATCH after replacement native sign-in with persisted refresh credentials, a replacement family for the same account, and genuine refresh revocation clearing the original session. Existing same-session parallel refresh, push-registration and secure-storage race tests remain in place.

Local release assessment and diff validation passed. Flutter is not installed in this container. Initial candidate `2982251f2a492a0a43709002f8d401d8ee9d241d` failed Flutter CI (PR run 38203255973): 97 cases passed, but the existing calendar preview test expected the established capitalized "Session changed" message. The correction preserves that message rather than weakening the existing test; final exact-head results are recorded in PR #5. The exact pushed commit requires observed Flutter analysis/tests, Android emulator checks and all existing platform/database/browser/storage/restore/search/antivirus CI jobs before it is recorded as verified in PR #5.

## Preserved release gates

This implements a client transport safety control; it does not close any frozen acceptance gate. The repository currently has an Android runner but no iOS runner/project; iOS scaffolding/build/signing remains open. Managed Firebase/APNs configuration, actual SDK and permission/token lifecycle wiring, real Android/iOS push acceptance, governed provider recovery, production alert routing/owners, full API/realtime/load tests, independent security/accessibility acceptance, authorized imports/cultural approvals and production disaster recovery remain OPEN. Frozen specifications, architecture decisions and all 260 acceptance records are unchanged. No merge or deployment is performed.
