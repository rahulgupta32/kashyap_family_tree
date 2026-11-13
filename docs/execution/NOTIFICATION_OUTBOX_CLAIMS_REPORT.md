# Durable notification outbox ownership

## Problem and resulting behavior

The previous notification poll used `SELECT ... FOR UPDATE SKIP LOCKED` in autocommit. The selection lock ended before recipient planning/delivery, so multiple API processes could select the same event and race independent notification status acknowledgements.

Migration 055 adds paired claim UUID/lease fields and a claimable-event index. Each poll iteration atomically selects/updates one eligible event using a locked CTE and commits `PROCESSING` ownership before invoking the existing processing path. It claims the next event only when ready to process it. Active leases exclude other pollers; expired leases can be reclaimed. Batch size is bounded to 1–50; failed planning retains the existing 30-second retry cooldown.

Each completion/failure acknowledgement requires the exact claim UUID, PROCESSING state and an unexpired lease. An expired or superseded owner cannot overwrite newer state. A lost committed claim acknowledgement starts no processing and leaves durable ownership for recovery. A lost committed completion acknowledgement cannot reverse the completion. Audit delivery status/retry history remains independent. Recipient authorization and dispatch deduplication remain unchanged.

## Verification

Seven new real PostgreSQL cases use separate pools to verify exclusive active claims, independently available later events, expired-lease recovery/stale completion, failure cooldown, lost claim acknowledgement, lost completion acknowledgement and refusal of unsafe rollback/incomplete claim metadata. Seven unit cases cover invalid batch bounds and empty-queue polling. The disposable restore fixture now retains a notification claim and explicitly checks its restored status/UUID/lease alongside retained audit retry evidence.

Local API typecheck, unit tests, release/workbook validators, syntax and whitespace checks are required before publication. Exact-head PostgreSQL/browser/Android/storage/scanner/search/restore CI results are recorded in PR #5. Local mocks are not fleet/provider acceptance.

## Limits and rollout

Claims fence outbox acknowledgements, not externally accepted provider requests. If a process pauses beyond its lease, recovery may overlap the previous process's external work. Existing unique dispatch identities limit duplicate job creation, but provider idempotency/receipt reconciliation remains mandatory; this change does not promise externally exactly-once delivery. The two-minute lease exceeds normal three-channel request deadlines but has not been accepted against production database/network pauses or load.

Stop/drain old notification workers before the schema/application rollout; old pollers do not understand ownership. Rollback refuses any PROCESSING/retained claim and requires reviewed draining before reverting both application and migration. Do not clear ownership on live workers merely to permit rollback. Production fleet failure, forced shutdown, long database stalls, throughput/backpressure, metrics/alerts and release review remain gates. Restore validates fictional logical state only, not production PITR/RPO/RTO.

Push-token lifecycle, live SMS/push acceptance, remaining functional/import/cultural approvals, complete load/accessibility/iOS evidence and all existing mandatory release gates remain unfinished. All 260 final acceptance rows/classifications remain unchanged. No merge or deployment.
