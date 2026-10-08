# Production completion execution map — 2026-10-08

Owner: Jyphra Technology Pvt. Ltd.

The reconciled assessment records 102 bounded implementations completed, 125 partial, 21 missing and 12 external gates. All 260 original acceptance rows remain open; 31 exact nonfunctional targets remain mandatory. This report is a current execution map, not a production-ready declaration.

## Missing functional implementations

- **SRCH-FR-006**: Search shall support transliteration/alias normalization without altering source names.
- **SRCH-FR-008**: Admin search shall support exact Person/User/Request ID lookup.
- **CAL-FR-005**: The system shall derive approved recurring family reminders from verified Person/event data.
- **INV-FR-004**: Creator shall select genealogy-derived audiences including approved relationship groups, descendants of an ancestor, branch and generation.
- **INV-FR-010**: Genealogy-based recipient resolution shall be reproducible using the verified graph snapshot/query context used at send time.
- **ADM-FR-007**: Super Admin shall manage branches, generations and cross-branch connections.
- **ADM-FR-013**: Admin portal shall provide import/dry-run/reconciliation tooling for genealogy migration.
- **ADM-FR-015**: System configuration shall be managed through typed, permissioned settings with change history.

## Missing dedicated nonfunctional evidence

- **NFR-PERF-001**: Normal cached/simple read endpoints p95 <= 500 ms at target load, excluding third-party latency.
- **NFR-PERF-002**: Normal transactional writes p95 <= 800 ms at target load, excluding OTP/map/calendar providers.
- **NFR-PERF-003**: Person search first page p95 <= 1.0 s for production-scale test dataset.
- **NFR-PERF-004**: Initial visible tree context p95 <= 2.0 s on supported network profile; deeper graph loads incrementally.
- **NFR-PERF-005**: Connected message send-to-receive p95 <= 2 s under target real-time load.
- **NFR-SCALE-001**: Architecture shall support at least 1,000,000 Person records without redesign of the core domain model.
- **NFR-SCALE-002**: Architecture baseline shall support at least 100,000 registered users and 10,000 concurrent real-time connections with horizontal scaling.
- **NFR-A11Y-001**: Admin web shall target WCAG 2.2 AA; mobile shall implement platform accessibility semantics, scalable text and adequate touch targets.
- **NFR-OBS-002**: Availability, error rate, queue lag, DB saturation, integration failures and backup failures shall alert operations.
- **NFR-DR-001**: Target Recovery Point Objective for critical database data <= 15 minutes.
- **NFR-DR-002**: Target Recovery Time Objective for critical service <= 4 hours.
- **NFR-DR-003**: A production-like restore rehearsal shall be completed at least quarterly after launch.
- **NFR-COST-001**: Storage, notifications, maps, OTP and compute usage shall expose measurable consumption and budget alerts.

## External release prerequisites

- **AUTH-FR-002**: Production SMS credentials and verified provider delivery/status acceptance are still required; adapter/test delivery exists.
- **REL-FR-006**: HG-002 authority-approved Nata/Saino catalogue and signed cases remain required; drafts cannot be authoritative.
- **CUL-FR-001**: External authority/provider/production acceptance is required. Published-read API/model exists; durable cultural revision CMS and authority publication workflow are missing.
- **CAL-FR-006**: External authority/provider/production acceptance is required. BS/Tithi metadata and basic events exist; AD conversions, recurrence, range views and update/cancel notification lifecycle remain.
- **CAL-FR-007**: External authority/provider/production acceptance is required. BS/Tithi metadata and basic events exist; AD conversions, recurrence, range views and update/cancel notification lifecycle remain.
- **CAL-FR-013**: External authority/provider/production acceptance is required. BS/Tithi metadata and basic events exist; AD conversions, recurrence, range views and update/cancel notification lifecycle remain.
- **JUT-FR-001**: External authority/provider/production acceptance is required. Gated calculator exists; signed HG-003 rule catalogue, exceptions, UI and reference cases remain. Do not activate draft cultural guidance.
- **JUT-FR-004**: External authority/provider/production acceptance is required. Gated calculator exists; signed HG-003 rule catalogue, exceptions, UI and reference cases remain. Do not activate draft cultural guidance.
- **NFR-AVL-001**: Frozen target: Core production APIs target >= 99.9% monthly availability excluding approved maintenance windows.. External authority/provider/production acceptance is required. Requirement-specific production/quality evidence remains; functional CI alone does not satisfy this NFR.
- **NFR-DATA-002**: Frozen target: Approved genealogy, audit and identity records shall use durable managed database storage with backup/PITR.. External authority/provider/production acceptance is required. Requirement-specific production/quality evidence remains; functional CI alone does not satisfy this NFR.
- **NFR-SEC-001**: Frozen target: External and service-to-service sensitive traffic shall use TLS 1.2+ with TLS 1.3 preferred where supported.. External authority/provider/production acceptance is required. Requirement-specific production/quality evidence remains; functional CI alone does not satisfy this NFR.
- **NFR-SEC-002**: Frozen target: Secrets shall be stored in managed secret storage; never committed to source control/mobile bundle.. External authority/provider/production acceptance is required. Requirement-specific production/quality evidence remains; functional CI alone does not satisfy this NFR.

## Partial requirements by area

Each row below still requires its full recorded behavior and acceptance; these are not optional later phases.

- **AUTH (4)**: AUTH-FR-001, AUTH-FR-009, AUTH-FR-011, AUTH-FR-012
- **PROF (4)**: PROF-FR-003, PROF-FR-006, PROF-FR-008, PROF-FR-009
- **GEN (3)**: GEN-FR-009, GEN-FR-010, GEN-FR-015
- **SRCH (2)**: SRCH-FR-001, SRCH-FR-005
- **CLAIM (2)**: CLAIM-FR-003, CLAIM-FR-011
- **CHG (3)**: CHG-FR-004, CHG-FR-007, CHG-FR-008
- **DUP (2)**: DUP-FR-001, DUP-FR-002
- **REL (9)**: REL-FR-002, REL-FR-003, REL-FR-004, REL-FR-005, REL-FR-007, REL-FR-008, REL-FR-009, REL-FR-011, REL-FR-013
- **CUL (8)**: CUL-FR-002, CUL-FR-003, CUL-FR-004, CUL-FR-005, CUL-FR-006, CUL-FR-007, CUL-FR-008, CUL-FR-009
- **CAL (8)**: CAL-FR-001, CAL-FR-002, CAL-FR-003, CAL-FR-004, CAL-FR-009, CAL-FR-010, CAL-FR-011, CAL-FR-012
- **JUT (4)**: JUT-FR-005, JUT-FR-006, JUT-FR-008, JUT-FR-009
- **NOT (5)**: NOT-FR-003, NOT-FR-004, NOT-FR-005, NOT-FR-007, NOT-FR-011
- **INV (8)**: INV-FR-001, INV-FR-002, INV-FR-003, INV-FR-005, INV-FR-006, INV-FR-008, INV-FR-009, INV-FR-012
- **COM (12)**: COM-FR-001, COM-FR-002, COM-FR-003, COM-FR-005, COM-FR-006, COM-FR-007, COM-FR-008, COM-FR-009, COM-FR-010, COM-FR-012, COM-FR-013, COM-FR-014
- **MAP (4)**: MAP-FR-001, MAP-FR-004, MAP-FR-006, MAP-FR-007
- **CHAT (12)**: CHAT-FR-001, CHAT-FR-002, CHAT-FR-003, CHAT-FR-004, CHAT-FR-005, CHAT-FR-006, CHAT-FR-007, CHAT-FR-009, CHAT-FR-010, CHAT-FR-012, CHAT-FR-013, CHAT-FR-014
- **ADM (9)**: ADM-FR-001, ADM-FR-002, ADM-FR-008, ADM-FR-009, ADM-FR-010, ADM-FR-011, ADM-FR-012, ADM-FR-014, ADM-FR-016
- **AUD (3)**: AUD-FR-001, AUD-FR-002, AUD-FR-005
- **PRIV (2)**: PRIV-FR-006, PRIV-FR-008
- **I18N (4)**: I18N-FR-001, I18N-FR-002, I18N-FR-004, I18N-FR-005
- **MEDIA (3)**: MEDIA-FR-001, MEDIA-FR-004, MEDIA-FR-006
- **NFR (14)**: NFR-REL-001, NFR-REL-002, NFR-DATA-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-PRIV-001, NFR-PRIV-002, NFR-I18N-001, NFR-COMP-001, NFR-OBS-001, NFR-MAINT-001, NFR-PORT-001, NFR-NET-001

## Operational release sequence

1. Finish all implemented-but-partial workflows and missing functional implementations; do not treat external authority gates as permission to omit their durable CMS/review interfaces.
2. Supply real production SMS/storage/map/calendar integration configuration, named administrators/approvers, approved cultural references and real genealogy import data through governed processes. Do not deploy fictional seeded authority accounts.
3. Configure infrastructure, TLS, managed secrets including independent MFA encryption key, durable database/PITR, private storage/scanner/workers and provider limits.
4. Demonstrate the exact latency/scale targets, accessibility, bilingual behavior, supported-device/iOS behavior and independent deployed security review.
5. Verify backups with a production-like restore meeting RPO <= 15 minutes and RTO <= 4 hours; exercise monitoring/alerts and a rollback rehearsal.
6. Resolve stacked PR #4/#5 review and migration order, run realistic staging acceptance and obtain signed release approval before production launch.

Authentication lifecycle completion is documented separately in AUTHENTICATOR_LIFECYCLE_REPORT.md. Governed emergency recovery and distinct-factor administrative login remain blockers. Engineering can continue independently on much of this map, but it cannot invent production credentials, cultural approvals or signed acceptance. No completion percentage or launch date is inferred from CI counts.

Cultural document CMS implementation now supplies partial evidence for eight former missing rows; authority content and full acceptance remain open. See CULTURAL_REVISION_CMS_REPORT.md. The remaining missing functional count is 8; missing dedicated NFR evidence remains 13.
