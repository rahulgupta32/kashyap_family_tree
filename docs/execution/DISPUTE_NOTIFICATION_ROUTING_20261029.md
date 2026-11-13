# Terminal dispute notification routing — 29 October 2026

## Demonstrated defect

On published source dbade5bb0158e73febb6525c6cc2dd8d58399716, focused regressions failed for both actual ClaimsService adjudication actions. DISPUTE_RESOLVED fell through to actor-only routing. DISPUTE_DISMISSED was not recognized by the category/inbox policy and generated no member notification. The underlying transactional audit intents already existed; no replacement event or schema was needed.

## Focused correction

One exact dispute-action classifier is shared by dispatcher, inbox and channel preference policy for DISPUTE_FILED/DISPUTE_RESOLVED/DISPUTE_DISMISSED. Existing claim-dispute recipient lookup now includes terminal events and resolves claimant/disputant from persisted records, retains actor notification and deduplicates overlaps. Workflow/in-app/channel switches still apply. Generic bilingual terminal text contains no reason, identity, attachment or resolution content. Actual correction-request action names also receive the existing generic correction message rather than an unrelated default. Unknown dispute suffix actions remain audit-only.

Existing account eligibility, durable outbox ownership, per-recipient inbox/channel unique keys, channel/provider checks, redaction and retry behavior are preserved. No historical public-data backfill, provider delivery, cultural activation or production acceptance is implied.

## Verification

Before fix:2 focused routing regressions FAILED with absent claimant/disputant recipients. After fix:31 focused routing/delivery-policy/provider-redaction cases PASS; API TypeScript PASS. Final focused rerun passed all7 routing/classification/correction-message assertions. New real PostgreSQL coverage extends the actual claim-dismissal workflow: read its committed audit event, explicitly disable all external channels, replay twice and require exactly one generic durable inbox row per claimant/disputant/adjudicator. This fixture proves inbox routing, not live SMS/FCM/APNs. It must execute on the published source in automatic CI before being called passed.

Parent dbade5bb batch automatic CI40922610825/iOS40922610838 remains source-bound; pending checks are not success or evidence for this later batch. Canonical new SHA/tree and final CI conclusions are recorded in PR5. Frozen requirements/edge cases/supplemental controls and all RG01..12 approvals remain unchanged/OPEN. Production NO-GO.

## Next executable work

Inspect automatic exact-source platform/browser/Android/iOS results and fix demonstrated failures only. Continue governed member dispute discovery/initiation and native rejection evidence under the frozen privacy model; do not infer public claim-ID discovery rights. Independent staging/signing/provider/device/legal/domain/UAT handoffs remain mandatory. No merge/deploy/store/real-data/cultural activation.
