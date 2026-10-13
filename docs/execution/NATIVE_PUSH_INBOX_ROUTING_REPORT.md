# Native generic push inbox routing

## Scope

One bounded task: route native provider signals through restored authentication and the existing MFA gate into the current-authorized inbox. Firebase `onMessageOpenedApp` and `getInitialMessage` are reduced to tap signals; `onMessage` becomes a generic bilingual foreground prompt. SDK reference: https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages . No background isolate handler is needed to perform UI navigation.

`FirebasePushSource` strips the complete message at the SDK boundary. The router knows only void events and a boolean initial-open result. It does not retain/render/use provider data, title, body, URLs or private IDs. It does not acknowledge an inbox item as read. The authenticated inbox fetches content using the existing generation-fenced HTTP transport and current backend authorization; actual destinations remain confined to that response.

## Authentication and lifecycle controls

- Consume the initial message once only after launch session restoration settles, including a signed-out launch. Later sign-in cannot replay that old event. Delayed initial results are bound to the session generation captured before the await; replacement sessions and disposal reject them.
- Retain at most one pending tap while the existing authenticator gate loads. Attach UI callbacks only in that gate's completed child. Signed-out taps are dropped, and queued old-generation taps cannot transfer to another account.
- Foreground events do not interrupt navigation. A fixed Nepali/English prompt offers an inbox action, with a generation/mounted check again at action time and at the navigation frame.
- Coalesce tap frames and taps while the push-opened inbox route is active. Navigation becomes available again after the route returns. Stream subscriptions are cancelled at app disposal; detached/stale callbacks do not navigate.
- Provider initialization/initial-message/stream errors do not block ordinary startup, echo SDK details or request push permission/token activation. Initial-message waiting is bounded to ten seconds. Existing Firebase auto-init opt-in policy, backend/provider payloads, permissions, signing, native source and dependency locks are preserved.

## Focused validation

Added eight router mock-source regressions and eight widget/mock-HTTP regressions: cold launch, once-only consumption, MFA waiting/retry, persisted session restoration and refreshed Authorization header, signed-out signals, account replacement, late callbacks, cancellation, provider errors, duplicate taps, reopen-after-back, foreground action and stale-action/logout fencing. These are synthetic source/mock HTTP tests, not physical-device/provider acceptance.

Local frozen release assessment and genealogy workbook validators passed: all 260 requirements, 31 frozen NFR targets, 14 workbook sheets/195 columns and OPEN approvals remain preserved. Whitespace and source review passed. Flutter/Dart are unavailable in the editing container, so no local analyze/widget/device success is claimed. Automatic exact-source CI must execute the new regressions; record actual run IDs/conclusions in `docs/development-control/CURRENT_STATE.md` and source-bound PR #5 comments. Running workflows are PENDING.

## Remaining gates and next boundary

Real configured Firebase/APNs foreground/background/terminated behavior, live provider/physical-device acceptance, supported device/accessibility/security/load, native signing/approved identities and full release gates remain OPEN. iOS launch reliability remains an independently recorded limitation. Durable failed-opt-out deletion reconciliation is a separate next batch; this routing work does not close it. Stop after recording this source's CI handoff. No merge/deployment.
