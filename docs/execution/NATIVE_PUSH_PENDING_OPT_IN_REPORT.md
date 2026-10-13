# Pending native push opt-in and registration rotation

Continues verified source `2079eb84af453653a1293119dcd27e5db50eac29` on `feat/application-completion`, PR #5. Advances AUTH-FR-009 and NOT-FR-005 without changing frozen requirements, acceptance classifications, provider evidence or authority gates.

## Completed behavior

An explicit device-notification opt-in can precede APNs readiness. Previously a null token left no server registration, so foreground reconciliation treated the member as never opted in and stopped the SDK. The lifecycle now retains pending opt-in in memory, scoped to the exact authenticated session generation. Foreground resume retries acquisition/registration without a new permission prompt or requiring an already-existing registration. Acquisition errors and unconfirmed registration PUTs retain the same session-local intent. This retries an idempotent device-registration operation, never a notification delivery or an uncertain FCM outcome.

Disable, sign-out and disposal clear pending intent. A replacement session cannot inherit it; fresh sessions still require explicit opt-in, or their own previously recorded server registration. Permission denial stops further passive attempts. No background polling, timer retry loop or new persistent consent store is introduced. If the process exits before initial registration, the member must opt in again; a confirmed existing registration continues to support normal authenticated restoration.

The token-refresh subscription is attached before token acquisition and the initial registration. It captures the newest credential during those awaits, uses the newest available value for the initial PUT, and drains any subsequent rotation after confirmation. Permission is checked again after acquisition and before initial registration; withdrawal cannot produce a successful enable result. Existing SDK shutdown ordering, serialized PUT-before-DELETE ordering and epoch/session fences are retained. The inbox's unavailable message now gives bilingual permission/retry guidance without provider implementation terminology.

## Verification scope

Ten new mocked provider/HTTP regressions cover repeated null-token foreground retries and one permission prompt; acquisition failure followed by recovery; unconfirmed registration PUT recovery; disable/sign-out/disposal clearing pending intent; replacement-session isolation; rotation during token acquisition; multiple rotations during initial PUT; and permission withdrawal during acquisition. Together with the twelve existing lifecycle cases, they exercise cancellation, explicit replacement activation, failed removal and stale refresh suppression.

Local whitespace and frozen release/workbook validators pass. Flutter analysis/tests and exact-source CI/native workflow outcomes are recorded in PR #5 after completion; no pass is inferred merely from these source additions. No live provider was contacted or credential added.

## Remaining gates

The mocked SDK tests establish orchestration, not real APNs readiness or delivery. Configured Firebase/APNs, approved app identity/signing, physical-device permission/refresh/background/tap/reinstall/process-kill behavior and signed-out persisted SDK behavior remain open. A stuck SDK future cannot be forced to complete by this queue. A failed/uncertain remote removal remains unconfirmed. Full remaining workflows, governed provider recovery, deployed monitoring, security/accessibility/load acceptance, approved imports and production PITR/RPO/RTO remain mandatory. All 260 final acceptance rows remain open. No merge or deployment.
