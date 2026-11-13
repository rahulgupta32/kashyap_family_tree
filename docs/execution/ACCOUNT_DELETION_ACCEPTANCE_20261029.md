# Account deletion: member journey acceptance batch — 29 October 2026

Status: implementation prepared; new-source runtime acceptance pending. No release gate is closed by this document.

## Frozen traceability

- PROF-FR-010, Master Requirements table9,row11: request, reauthentication/confirmation and final outcome.
- PROF-FR-011, table9,row12: authentication de-link/deactivation independent of retained genealogy, subject to approved policy.
- Related RG-04 functional, RG-05 security, RG-07 privacy, RG-08 accessibility/localization and RG-10 supported clients remain OPEN.

The verified parent4e2e084/tree62149e97 passed CI40817454646 and iOS40817453571. Its deletion service/retention/concurrency tests existed, but no account deletion control was found in Flutter profile/privacy. Administrative profile also lacks a deletion control. Earlier aggregate counts do not establish this missing member UI journey.

## Engineering change

Flutter profile/privacy now opens an account deletion screen with bilingual explanation, server-issued OTP challenge, six-digit concealed input and separate explicit confirmation. The real account-bound API remains authoritative; neither passwords nor actor IDs are inferred. Server diagnostics and test-mode OTP are not displayed. No legal retention rule is introduced or changed.

The client requires a valid confirmed deletion acknowledgement before clearing encrypted credentials and the durable chat outbox. The existing generation fence prevents late responses and retained callbacks from clearing a replacement account. A failed/unknown acknowledgement is not reported as successful. Session changes remove challenge/code/confirmation state.

Widget regressions cover explicit confirmation, storage cleanup, failed/invalid acknowledgements, duplicate callbacks and account replacement. These are isolated client controls, not live-runtime acceptance.

The third Android acceptance case uses the actual app, PostgreSQL16/Redis7/NestJS API and synthetic fixture account that earlier claimed a Person through two independent reviews. It verifies two active sessions before deletion, obtains a real test-mode deletion OTP via a transparent network observer, submits through actual controls, checks revoked bearer tokens, cleared Android secure stores, and retained unclaimed Person/tree links. No HTTP status/body is fabricated. Test SMS/credential-free Firebase remain separate from real provider acceptance. The fixture account is disposable; no real family data is used.

## Requirement matrix and evidence

After all device cases pass, scripts/build-runtime-acceptance-matrix.py emits test-results/runtime-acceptance-matrix.json in the retained Android artifact. It preserves all260 frozen identifiers/text/source locations/acceptance/NFR targets and registers existing implementation assessment provenance. It binds log hash/source SHA/tree to the completed journeys and attaches bounded evidence only to PROF-FR-010/011. It rejects missing completion markers and grants no independent or signed acceptance. Existing per-row categories outside this batch are historical conservative classifications, not a new full source audit.

All successful and failed exact-source workflow IDs/conclusions belong in PR5's current checkpoint; no running result is passed. The generated matrix does not claim complete traceability for every requirement from aggregate CI totals.

## Missing acceptance and external dependencies

- Independent privacy/security review, approved deletion/retention/notices and legal holds remain mandatory. Existing service hardcodes a three-year dispute hold and statutory/authority strings; this batch does not certify that legal basis or an authorized cultural/data authority.
- Admin deletion UX, complete consent/retention/audit privacy review, physical Android/iOS deletion journeys and real SMS remain unaccepted.
- Existing CI services are isolated synthetic runtime fixtures, not an approved staging deployment. No staging/production hosting, actual PITR/RPO/RTO, alert routing/on-call, production provider/signing or physical device evidence is invented.
- Other required journeys retain their existing partial/blocked statuses. New-person/evidence request, dispute and cultural authority workflows need separate cross-client acceptance where not covered by current exact-source scenarios.
- All RG-01 through RG-12 and260 final requirement acceptance records remain OPEN; no merge, production deploy, store submission, real-data import or unapproved cultural activation.
