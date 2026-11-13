# Push outcome monitoring and supervised notification worker

Continues verified checkpoint `d049e5ad3df5934a99afcdc3090aabef9a9994e2` on `feat/application-completion`, PR #5. Frozen specifications, architecture decisions, requirement classifications and authority approvals are preserved.

## Implemented

The existing central/super-admin, no-store `GET /audit/delivery` response now includes a single-statement aggregate snapshot of open push dispatches and device attempts. Counts distinguish pending, processing, failed and held dispatches; planned/in-flight devices; expired claims; unknown/rejected outcomes; and confirmed device outcomes awaiting parent reconciliation. Ages report the oldest held dispatch and unresolved device evidence. Completed dispatches and non-push channels are excluded. Late immutable observations are interpreted consistently with the delivery reconciler; a late accepted receipt is not counted as unknown.

The response exposes no user, session, registration, generation, token, receipt, payload or provider-error details. Existing current-role, privileged-session and production MFA controls remain in force. The bilingual administration console displays these aggregates, warns about held/uncertain outcomes, and states that provider acceptance does not prove device delivery. Refresh remains read-only. Missing/malformed status is unavailable, never a fabricated healthy zero. Failed refresh clears prior counts; fixed worker failure codes are validated before display.

The notification worker now waits for migrations, coalesces startup calls, refuses to restart after shutdown, and joins in-flight work. Its status reports this API process only: lifecycle, active-cycle state, last start/completion/failure timestamps and fixed phase-failure codes. A failed retention or reconciliation phase cannot falsely record a fully successful cycle. Later successful cycles update completion while preserving the previous failure timestamp for investigation. Test mode remains explicitly disabled.

Migration 058 adds a partial lookup index over open push dispatches, helping monitoring and reconciliation avoid completed history. Its index-only rollback retains every credential, attempt and provider observation.

## Verification

Added real PostgreSQL aggregate tests covering expired/live claims, unknown/rejected outcomes, late positive proof, completed/non-push exclusions, clearing resolved counts, privacy and index-only rollback. Existing authenticated HTTP tests also check the new status under central authority, role revocation, production MFA and dependency failure. Worker tests cover pending migrations, startup failure, overlapping work, phase failures, successful recovery, shutdown and test-disabled state.

Browser tests exercise the actual API response and inherited access restrictions, labelled bilingual counts, keyboard refresh, resolved-state updates, stale-data clearing, malformed successful responses and suppression of untrusted diagnostics. Mocked browser responses test failure presentation; they are not live provider acceptance. Exact-head CI and observed counts are recorded in PR #5 after completion. The new migration also participates in the existing fictional logical restore/schema comparison.

## Remaining release gates

This is operator visibility, not configured production alert routing or fleet health acceptance. Named incident owners, escalation/acknowledgement procedures, approved thresholds, off-process heartbeat monitoring and production telemetry configuration remain open. A local worker snapshot cannot prove other API processes are alive. Read-only inspection never retries an uncertain push; reviewed provider recovery and provider-policy retry tooling remain outstanding.

Live FCM/IAM and native SDK token/refresh/logout integration, APNs/iOS and physical-device push acceptance, full HTTP/realtime workloads, broader accessibility/security acceptance, approved real-data imports, managed-key recovery and production backup/PITR/RPO/RTO remain open. All 260 final acceptance gates remain OPEN. No merge or deployment follows from this report.
