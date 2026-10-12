# Production completion workflow — 2026-10-12

Owner: Jyphra Technology Pvt. Ltd. This execution plan does not change the frozen baseline, requirement classifications, acceptance ledger, or cultural authority gates. Source precedence remains the frozen freeze record and SDLC specification, master specification/BRD, detailed behavior and edge cases, privacy policy, then gated drafts.

## Integration and release branches

1. Review open M4 PR #4 against `develop`, including its restored full tree, migrations, current CI, security/privacy behavior and rollback constraints. Merge it into `develop` after reviewer approval and successful exact-head checks. Do not force-push or squash away the recovery history.
2. Keep completion PR #5 on `feat/application-completion` while its remaining scope is developed in small, source-bound batches. Once PR #4 is integrated, retarget PR #5 to `develop`; inspect the resulting diff and rerun checks. Promote PR #5 from draft and merge into `develop` only after independent review of its full stacked migrations, secrets/privacy surfaces and CI. This is an integration merge, not production release approval.
3. Protect `main`. Merge or promote to production only after all 260 frozen requirement acceptance records, the 31 NFR targets, source/privacy/cultural approvals, production provider/device evidence, rollback and disaster recovery are signed off. Use a staged deployment with a tested rollback and named incident owners. Do not clear live evidence or claims to permit rollback.

## Fast execution cadence

Each batch has one bounded behavior or safety objective, explicit requirement/edge-case links, tests against real dependencies where relevant, negative controls for fail-closed behavior, release evidence and an exact pushed SHA. An initial failed run is retained; only a successful exact-head rerun counts. No CI count substitutes for signed requirement acceptance.

Run these streams in parallel when staffed: (A) finish partial functional workflows and bilingual UI; (B) native FCM/APNs SDK, token lifecycle, physical-device and provider recovery; (C) governed source/cultural/calendar approvals and import promotion with two rehearsals; (D) production telemetry, security/accessibility/load acceptance, managed secrets, backups/PITR and incident drills. Review the requirement ledger after each stream, not by assigning fractional credit to partial rows.

Jyphra must provide named decision makers and incident owners, approved real data and cultural references, production hosting and provider accounts, Apple/Google identity/signing access, device coverage and security/acceptance reviewers. Engineering can prepare interfaces and fictional rehearsals before those arrive but cannot declare real acceptance without them.

## Current checkpoint and planning range

PR #5 head before this plan: `52425294b4adbed8b5a1db70bbdeb35bfd6dd722`, exact-head CI and iOS workflows successful. The last reconciled implementation classification is 102 completed bounded implementations, 133 partial, 13 missing dedicated NFR evidence and 12 external gates. All 260 final acceptance rows remain open. Refresh this assessment against new code before making a completion claim.

Planning range with a dedicated five-to-six-person team and prompt external inputs is 20–32 weeks for complete frozen-scope production acceptance; with one engineer it can take 9–15 months or longer. External approval or provider delays make a calendar launch date unbounded. The range is a staffing estimate, not a release gate or commitment.
