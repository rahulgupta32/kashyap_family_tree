# Native push activation and shutdown ordering

Continues verified source `10c97b55c293f409d63410c8a383e6c61240b83f` on `feat/application-completion`, PR #5. This bounded safety change advances AUTH-FR-009 (session device/token lifecycle) and NOT-FR-005 (delivery preferences), without changing frozen scope, authority gates or acceptance classifications.

## Problem and behavior

SDK token acquisition can enable persistent Firebase auto initialization after asynchronous APNs/token work. Session-generation checks already prevented a stale token from being registered with a replacement session, but sign-out or disable could stop the SDK before that delayed SDK work finished. Its later completion could re-enable the SDK after shutdown.

The lifecycle now serializes SDK permission/token work and shutdown separately from HTTP writes. Disable, sign-out and disposal order SDK stopping after prior SDK operations; existing generation/epoch checks suppress stale registration and subscription creation. A session-local stop also blocks passive foreground restoration while server logout/removal is pending or unsuccessful. Only a new explicit opt-in, or restoration under a new session generation, can resume acquisition. A newer explicit activation supersedes a queued old-session stop without stopping the newer SDK use. Disposed lifecycle objects cannot be restarted. Subscription cancellation clears the captured subscription before awaiting it, and activation rechecks its generation after cancellation.

Server removal remains separate from local SDK shutdown: a failed DELETE still stops the local SDK and reports failure, rather than claiming confirmed server revocation. Existing serialization still orders a completed in-flight PUT before DELETE. The app consumes asynchronous disposal errors, as it already does for expiry-triggered sign-out, so background SDK shutdown failure does not become an unhandled widget-disposal exception.

## Verification

Six new pure Dart regression cases model auto-init becoming enabled only when delayed token acquisition completes: sign-out, disable and disposal while acquisition is pending; SDK shutdown despite failed server removal; explicit replacement-session activation superseding old shutdown; and rejection of restarting a disposed lifecycle. These also check blocked passive resume, absence of late registration and refresh writes, and final SDK state. They extend the existing six lifecycle cases, including permission withdrawal, account-switch fencing and in-flight rotation/removal ordering.

Local whitespace validation and frozen release/workbook validators pass. This workspace has no Flutter SDK; Flutter analysis, the complete mocked HTTP/widget suite, Android/live-API checks and native compilation/startup require exact-commit CI. Actual workflow results are recorded in PR #5 after completion; this report does not infer a pass from added tests.

## Limits and remaining acceptance

The fake provider/HTTP tests verify ordering, not physical SDK delivery. The queue cannot force an unresponsive SDK operation to complete; abrupt process termination and signed-out persisted SDK behavior still need device verification. A local stop does not prove remote registration removal or provider cancellation, especially after offline/failed logout. APNs readiness after initial opt-in, supported-device lifecycle/permission/background/tap acceptance, configured Firebase/APNs and real provider delivery remain open. Production monitoring/recovery, security/accessibility/load acceptance, approved imports and production PITR/RPO/RTO also remain mandatory. All 260 final acceptance records remain open. No merge or deployment.
