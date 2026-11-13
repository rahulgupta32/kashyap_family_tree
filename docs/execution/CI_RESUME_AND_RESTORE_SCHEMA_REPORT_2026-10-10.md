# CI resume and restore schema coverage — 2026-10-10

Owner: Jyphra Technology Pvt. Ltd.

## Verified interrupted checkpoint

PR #5 remained open, draft and unmerged, targeting `feat/m4-governed-workflows`. Published application-completion head was `2fbb229a4ad77b288d5237aa2bd19e19dd8f7907`. Both recovered working trees were clean. The newer checkout was preserved on its prior local branch and a new verification branch was created directly from the fetched published head; no implementation was overwritten or repeated.

PR CI run 38057191209 completed successfully in all five jobs. Job steps and platform/storage/Android logs confirm 315 unit tests, 442 general integration tests, 49 browser scenarios, 10 dedicated storage tests and two Android live-API scenarios passed. The ten storage tests skipped in the general suite ran in the dedicated job. Flutter analysis/widget tests, real scanner checks, frozen install, dependency audit, workspace typechecks, production builds, release/workbook validators and disposable PostgreSQL restore all completed successfully. Dependency audit reported no known vulnerabilities. Thus the interrupted verification did finish; no failed latest-head job needs a speculative fix or rerun.

Earlier schema comparison and browser fixture failures were already corrected in the published history (`90717b1` and `2fbb229`). Their failed runs remain historical evidence, not current release evidence. The successful disposable restore remains fictional logical recovery, not production PITR/RPO/RTO acceptance.

## New disaster recovery verification gap

The restore manifest previously compared records, constraints, indexes, trigger declarations and sequence values. It omitted column definitions and stored routine bodies, so unchanged trigger declarations could conceal altered enforcement code. The rehearsal now also compares public function/procedure definitions and column names/order/types/defaults/nullability/identity/generated metadata. Stable ordering includes overload arguments. No normalization is applied to routine bodies or column metadata.

Two real-PostgreSQL negative controls run after the initial restore comparison: changing a fictional SQL function body must change the routine manifest while records and trigger declarations remain unchanged; adding a column must change the column manifest. Both mutations are rolled back, and the complete manifest must match again before audit/protection checks proceed. The redacted report records both drift checks. No production database or application workflow is changed.

## Validation and mandatory gates

Local release assessment and frozen workbook validators, three schema canonicalization regressions, JavaScript syntax and whitespace checks passed. Real PostgreSQL negative controls and full restore execution require the new exact-head CI run: this recovery container does not expose Docker/PostgreSQL executables. The preceding green run cannot validate this new script revision.

All 260 final acceptance rows remain open. Assessment totals remain 102 bounded completed implementations, 133 partial, 13 missing dedicated nonfunctional evidence requirements and 12 external gates. Priorities remain full auth lifecycle/emergency recovery and governed exhausted-worker remediation; approved import mapping/promotion and two rehearsals; cultural/calendar authority and remaining partial workflows; exact latency/scale tests; full bilingual/WCAG/mobile/iOS acceptance; operational alerts; production managed backup/PITR/restore/rollback evidence; provider credentials, TLS, managed secrets, named approvers and signed release acceptance. No merge or deployment is authorized by this report.
