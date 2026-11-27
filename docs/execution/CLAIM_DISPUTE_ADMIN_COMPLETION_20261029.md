# Private dispute administration — 29 October 2026

## Demonstrated gap and implementation

At verified source97fac9696d5715c831eafe314ec4c599a17e12f3/tree0dd2533ab0219e11bcbf3f0368c75d9d7a471ff9, the admin API client advertised UPHELD but the server accepts RESOLVED. The portal could inspect DISPUTED claims but could neither discover dispute IDs/reasons nor adjudicate them.

The shared ResolveClaimDisputeDto now requires existing RESOLVED/DISMISSED outcomes and nonoptional notes. GET /claims/:id/disputes authenticates and requires Super Admin at controller and service boundaries, validates the claim UUID/existence before private reads, maps only the explicit DTO and sends private,no-store. No public/member/branch-wide discovery or phone-number lookup was added.

The bilingual admin panel loads for a selected Super Admin claim only. Reads and writes are fenced by account/token/claim and request generation, private state clears across changes/unmount, and mutations are single-flight. Empty reasons are disabled, explanations distinguish unlinking from genealogy deletion, terminal decision evidence is displayed, and uncertain responses hide action controls until fresh inspection. Actual adjudication retains the existing server conflict-of-interest/family-recusal checks, transactional audit intent, terminal replay and conditional unlinking. No approval semantics, cultural rule, schema or dependency changes. Mobile additionally fixes a demonstrated CLAIM-FR-006/010 gap: rejected claims previously showed only status, not the deciding reviewer feedback. The owning claimant now sees the applicable tier1/tier2 rejection reason as plain text and bilingual next-step guidance, without reviewer identity/evidence links. Malformed feedback fails closed; session replacement clears it. Three widget regressions cover both tiers, privacy/session clearing and invalid input. The existing real Android journey now requests correction through the API and completes version-bound resubmission through the actual member UI before independent approval; its completion marker and persistence assertions are required evidence, not assumed success.

## Regression evidence to require

- Focused unit cases: non-adjudicator denial before database access; malformed/missing identity; explicit DTO minimization and terminal evidence.
- Existing real PostgreSQL workflow additionally inspects OPEN and terminal disputes and denies branch-only inspection.
- New unmocked Playwright journey uses real OTP/API/PostgreSQL/Redis synthetic identities: independent approval, private dispute inspection/cache headers, unauthenticated/member/verifier denial, disabled empty-note action, DISMISSED keeps account linkage, RESOLVED safely unlinks while retaining Person, conflicting terminal replay preserves original outcome.
- Android correction extension requires the actual reviewer note, member edit/truth confirmation, server version increment/resubmission count, PENDING_TIER1 and still-unlinked account, followed by independent approval. Three widget feedback cases are separate mock-transport evidence, not native rejection acceptance.
- Existing full CI includes backend/admin typechecks/builds, frozen controls, Flutter/native and privacy regressions. Discovery/static checks are not actual runtime success; record exact-source automatic workflow conclusions in PR5.

## Acceptance boundaries and next work

Supports the disputed-claim escalation path in CLAIM-FR-008 and related review controls. Does not independently accept that entire requirement or its mobile/admin/security/UAT scope. Does not add member dispute discovery/initiation, iOS live deletion, actual SMS/push/provider/signing/physical-device evidence or production operations.260 signed requirements and RG01..12 stay OPEN; NO-GO.

Source recoverability: commit/push only reviewed source to existing integration branch without force; verify tree and fresh retrieval. Resolve exact batch identity with git log for this report and read PR5 for canonical SHA/tree/actual CI. Historical public-publication HOLD has been superseded by explicit owner clearance and successful publication, not bypassed. No merge or production deployment.

## Local executed checks before publication

Pinned pnpm9.15.9 frozen install and shared-package builds succeeded without dependency/lock changes. Focused Jest claim-dispute-read/claim-review-boundaries:33 tests/2 suites PASS. API tsc and admin next typegen/tsc PASS. All three frozen requirement/release/workbook validators PASS; ten requirements-matrix negative controls PASS; git diff --check PASS. Playwright discovered the one new real-service journey; it has NOT run locally. PostgreSQL/Redis installation was blocked by managed runner user/group switching, and Flutter SDK is unavailable locally. Actual browser/PostgreSQL/Flutter/Android acceptance therefore remains pending exact-source automatic CI; no mocked/static substitute is claimed. React review checked scoped hooks, labelled controls, plain-text rendering, single-flight mutation and no private localStorage.

## Demonstrated browser corrections

Parent main40922610825/platform123619594277 failed browser verification after607 unit and591 general PostgreSQL cases passed (ten storage cases covered by dedicated job).85 browser cases passed/two failed: the new test retained a pre-navigation token that session restoration correctly revoked; the existing correction scenario could not reach Close after the new panel expanded the unbounded dialog. The test now obtains current browser credentials for every Super Admin API read/write. The actual modal gains90dvh max-height/vertical scrolling and labelled dialog semantics. A600px viewport checks the Close control scrolls into view. No authentication changes, force clicks, skipped assertions or timeout increases. Corrected-source browser/device/native results remain pending until inspected; failed parent runs stay failed.
