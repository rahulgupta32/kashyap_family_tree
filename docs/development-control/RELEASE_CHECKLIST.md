# Release checklist — NOT READY

Owner: Jyphra Technology Pvt. Ltd. Mandatory frozen release gates are reproduced by identifier below. This checklist is operational tracking; it does not change their acceptance or authorize merge/deployment. No signed gate closure is inferred from CI. No arbitrary completion percentage or launch date is assigned.

Source: frozen Master Requirements §38 and Freeze Record §6. Complete mandatory behavior and edge-case coverage is tracked in `REQUIREMENTS_MATRIX.md`; exact-source failures/evidence in `CI_FAILURES.md` and `CURRENT_STATE.md`.

| Gate | Frozen evidence required | Present engineering evidence | Still required / accountable role | Status |
|---|---|---|---|---|
| RG-01 Scope | Master requirements signed; no undocumented feature deferral | Frozen baseline and preserved requirement/edge/supplemental inventories | Product/Business Owner review all mandatory rows and approve any disposition; no deferral supplied | OPEN |
| RG-02 Domain | Approved Nata/Saino, Jutho, Tithi/Shraddha rule sets and signed tests | Gated rule engines/provider fallback and provisional reference data | Cultural/Religious Authority two-person approved versions/cases/source; drafts remain neutral/disabled | OPEN / OWNER APPROVAL |
| RG-03 Data | Production migration dry run, duplicate reconciliation, import acceptance | Staging/dry-run/reconciliation tooling and fictional fixtures | Data Steward/Super Admin approved data/consent/provenance, complete controlled promotion, two isolated import rehearsals, sampling and reconciliation | OPEN |
| RG-04 Functional | All mandatory FR implemented with passing traceability | Backend/admin/native suites and recorded bounded workflow implementations | Engineering/QA complete every partial workflow; verified requirement/case/journey mapping on exact candidate | OPEN |
| RG-05 Security | Closed threat model, resolved critical/high findings, penetration sign-off | Authorization/rate/media/session/audit regressions and production dependency audit | Security/Tech Lead independent deployed threat/DPIA/security/secret/penetration review, remediation and approved residual-risk record | OPEN |
| RG-06 Performance | Approved capacity/latency targets or accepted exceptions | Fictional million-Person repository benchmark only | Engineering/Operations full HTTP/tree/read/write/message load, 100k registered users/10k realtime connections, supported network/device profiles and exact p95 targets | OPEN |
| RG-07 Privacy | Visibility, minors/location/evidence/export controls and accepted notices | Current authorization regressions/private storage and generation-bound transport | Product/Privacy/Legal approve consent/retention/deletion/minors, legal notices/DPIA/processors; enforce prohibited-collection policy and review all client private caches | OPEN / OWNER APPROVAL |
| RG-08 Accessibility & localization | Nepali/English and accessibility acceptance | Bilingual controls and selected browser accessibility work | UX/QA full supported-device journeys, scalable text/touch/semantics/screen reader and admin WCAG 2.2 AA evidence; approved translation catalogue | OPEN |
| RG-09 Operations | Monitoring, alerts, runbooks, backups, successful restore, incident/on-call ownership | Disposable fictional logical restore/audit evidence; bounded workers/health/provider diagnostics | Operations deploy/instrument approved staging/production stack, name owners/routes, test alerts/fleet/recovery and actual PITR/RPO<=15min/RTO<=4h restore/rollback | OPEN |
| RG-10 Store/distribution | Android/iOS signing, privacy disclosures, screenshots, support links, store checks | Android emulator/live API; iOS simulator/Keychain and unsigned device compilation | Release/Product approved identities/signing/accounts, physical devices, real FCM/APNs/OS lifecycle, signed release builds, disclosures/support/deletion URLs and store review | OPEN / EXTERNAL |
| RG-11 UAT | Stakeholder/community acceptance of critical journeys | Selected fictional browser/device workflow assertions | Business Owner/UAT Group execute and sign all frozen E2E-001..016 and relevant edge cases with approved test data | OPEN / OWNER APPROVAL |
| RG-12 Go-live | Approved production checklist, rollback plan, named incident command | This checklist and controlled evidence process | Release Manager/Super Admin/Jyphra explicit go/no-go, completed gates, migration/recovery/drain procedures and named incident command | OPEN / OWNER APPROVAL |

## Dependency-aware execution milestones

1. **M-A Assurance and recoverability:** complete per-row inventory, evidence/decision/failure registers, source-bound fast/full CI; resolve demonstrated defects without weakening assertions.
2. **M-B Complete private user journeys:** registration/member verification, genealogy changes, eligible chat, community/moderation/inbox, calendar/invitations, gallery/media/map and account lifecycle across native/admin/API. No external gate is permission to omit engineering.
3. **M-C Controlled data and domain:** approved workbook mapping/transformation/promotion/rehearsals; approved cultural/calendar content/rules and named governance. Engineering and authority tasks may proceed separately; no draft activation.
4. **M-D Production assurance:** full bilingual/accessibility/security/load/support-matrix and network/resilience/worker recovery evidence; all exact frozen NFR targets.
5. **M-E Reproducible staging/release:** approved cloud/TLS/secrets/PITR/private storage/scanner/providers/monitoring, signed mobile builds, test backup/rollback and full staged UAT; complete the external handoff and operations runbook.
6. **M-F Authorized rollout:** independent candidate review, required checks/protections and signed owner gates; only explicit authorization permits merge/deploy/store submission. Monitor stabilization and G7 acceptance after rollout.

## Candidate entry record (must be filled from actual evidence)

- Exact release SHA/tree and artifact digests: **not appointed**.
- Mandatory automated checks on candidate: **not all completed / final candidate absent**.
- All 260 requirement acceptance records: **OPEN**; independent 260 edge cases and supplemental controls also require traceable acceptance.
- Critical/high security and release-blocking defects: **no signed zero-finding assertion**.
- Data/domain/privacy/commercial/operations/distribution/owner gates: **OPEN**.
- PR #5 review: draft/open, existing M4 base; no submitted reviews at master-audit recovery. Review stacked migration/PR sequence before any authorized integration merge; main stays gated.
- Public deployment/app store submission/main merge: **not authorized**.

See `EXTERNAL_HANDOFF.md` and `docs/operations/PRODUCTION_RUNBOOK.md` for public ownership and acceptance boundaries; detailed operational preparation documents are provided privately. These are preparation documents, not proof that infrastructure or owners exist. Keep all evidence linked to its actual source and test scope.

Current complete execution assignment: [COMPLETION_SEQUENCE.md](COMPLETION_SEQUENCE.md) and its260-row CSV. This supersedes older speculative next-feature suggestions; it does not close any gate or amend frozen scope.
