# Baseline Documentation Index

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Baseline Version**: v1.1  
**Freeze Date**: 2026-09-08  
**Verification**: All 12 files SHA256 verified ✅

## Document Precedence (highest to lowest)

1. **Signed Jyphra change decision** (none yet)
2. **Final SDLC Execution Governance Specification v1.0** — SDLC gates, entry/exit criteria, artifacts, approvals, change control
3. **Master Requirements & SDLC Specification v1.1** — Complete functional/NFR requirements, architecture, data model, API contract, screens, testing, operations
4. **Business Requirements Document** — Business scope, personas, business rules, success metrics, constraints
5. **Detailed Behaviour Edge Case Specification v1.0** — 260 edge cases with expected behaviors
6. **Module catalogues, matrices, templates, supporting plans** — All xlsx workbooks below

## Document Registry

| # | Document | Filename | SHA256 | Type | Pages/Rows | Key Content |
|---|----------|----------|--------|------|------------|-------------|
| 1 | Master Requirements & SDLC Specification | `Kashyap_Adhikari_Master_Requirements_SDLC_Specification.docx` | `033695d9...` | Requirements | ~4800 lines | All FR/NFR IDs, architecture, data model, API catalogue, screens, testing, operations |
| 2 | Business Requirements Document | `Kashyap_Adhikari_Business_Requirements.docx` | `ecbc017f...` | Requirements | ~42K chars | Business scope, personas, rules, metrics, constraints |
| 3 | Detailed Behaviour Edge Case Specification | `Kashyap_Adhikari_Detailed_Behaviour_Edge_Case_Exception_Negative_Test_Specification_v1.0.docx` | `d4ed5d04...` | Test Spec | ~78K chars | 260 edge cases with behaviors |
| 4 | Edge Case Traceability Catalogue | `Kashyap_Adhikari_Edge_Case_Exception_Negative_Test_Traceability_Catalogue_v1.0.xlsx` | `af31e36e...` | Traceability | 5 sheets, ~800 rows | Edge case IDs, categories, requirements mapping |
| 5 | SDLC Execution Governance | `Kashyap_Adhikari_Final_SDLC_Execution_Governance_Specification_v1.0.docx` | `e990d922...` | Governance | ~38K chars | SDLC phases P0-P7, gates G0-G7, CI/CD quality gates, change control |
| 6 | Documentation Baseline Freeze Record | `Kashyap_Adhikari_Documentation_Baseline_Freeze_Record_v1.0.docx` | `643027fc...` | Governance | ~11K chars | Freeze conditions, status, production authorization withheld |
| 7 | Privacy Data Retention Policy | `Kashyap_Adhikari_Privacy_Data_Retention_Policy_v1.0.docx` | `7268b408...` | Policy | ~31K chars | Data categories, retention periods, consent, minors, legal holds |
| 8 | Administrator Branch Authority Framework | `Kashyap_Adhikari_Administrator_Branch_Authority_Governance_Framework_v0.1.xlsx` | `ea4efdc0...` | Governance | 10 sheets | Roles (ROLE-001..020), permissions, branch authority, separation of duties |
| 9 | Nata/Saino Desk Validated Draft | `Kashyap_Adhikari_Nata_Saino_Desk_Validated_Draft_v0.2.xlsx` | `c56b3733...` | Domain Rules | 7 sheets, 71 rules | Kinship path codes (NS-001..071), Nepali/English terms, validation status |
| 10 | Initial Genealogy Data Collection Template | `Kashyap_Adhikari_Initial_Genealogy_Data_Collection_Import_Template_v0.1.xlsx` | `b1e8342f...` | Data Template | 14 sheets | Person, relationship, branch, event data schemas for import |
| 11 | Scale Staffing Operating Budget Plan | `Kashyap_Adhikari_Scale_Staffing_Operating_Budget_Plan_v0.1.docx` | `21257f22...` | Budget | ~11K chars | Staffing model, infrastructure costs, operational budget |
| 12 | Scale Staffing Operating Budget Model | `Kashyap_Adhikari_Scale_Staffing_Operating_Budget_Model_v0.1.xlsx` | `b340f429...` | Budget | 8 sheets | Cost projections, capacity modeling |

## Requirement ID Ranges

| Prefix | Module | Count | Source |
|--------|--------|-------|--------|
| AUTH-FR-001..012 | Authentication & Session | 12 | Master Spec §8.1 |
| PROF-FR-001..012 | Profile, Preferences & Privacy | 12 | Master Spec §8.2 |
| GEN-FR-001..018 | Genealogy Person & Family Tree | 18 | Master Spec §8.3 |
| SRCH-FR-001..008 | Search & Discovery | 8 | Master Spec §8.4 |
| CLAIM-FR-001..012 | Profile Claiming | 12 | Master Spec §8.5 |
| CHG-FR-001..015 | Genealogy Change Requests | 15 | Master Spec §8.6 |
| DUP-FR-001..009 | Duplicate Detection & Merge | 9 | Master Spec §8.7 |
| REL-FR-001..013 | Relationship & Nata/Saino | 13 | Master Spec §8.8 |
| CUL-FR-001..010 | Cultural & Historical Content | 10 | Master Spec §8.9 |
| CAL-FR-001..013 | Calendar, Dates & Tithi | 13 | Master Spec §8.10 |
| JUT-FR-001..009 | Jutho Calculation | 9 | Master Spec §8.11 |
| NOT-FR-001..011 | Follow & Notifications | 11 | Master Spec §8.12 |
| INV-FR-001..012 | Invitations & RSVP | 12 | Master Spec §8.13 |
| COM-FR-001..014 | Community Posts & Moderation | 14 | Master Spec §8.14 |
| MAP-FR-001..007 | Household & Community Map | 7 | Master Spec §8.15 |
| CHAT-FR-001..014 | Private & Group Communication | 14 | Master Spec §8.16 |
| ADM-FR-001..016 | Administration & Governance | 16 | Master Spec §8.17 |
| AUD-FR-001..005 | Audit & Evidence | 5 | Master Spec §8.18 |
| PRIV-FR-001..008 | Privacy & Consent | 8 | Master Spec §8.19 |
| I18N-FR-001..005 | Localization & Accessibility | 5 | Master Spec §8.20 |
| MEDIA-FR-001..006 | Media & File Handling | 6 | Master Spec §8.21 |
| NFR-PERF-001..005 | Performance | 5 | Master Spec §9 |
| NFR-SCALE-001..002 | Scalability | 2 | Master Spec §9 |
| NFR-AVL-001 | Availability | 1 | Master Spec §9 |
| NFR-REL-001..002 | Reliability | 2 | Master Spec §9 |
| NFR-DATA-001..002 | Data Integrity | 2 | Master Spec §9 |
| NFR-SEC-001..005 | Security | 5 | Master Spec §9 |
| NFR-PRIV-001..002 | Privacy NFR | 2 | Master Spec §9 |
| NFR-A11Y-001 | Accessibility | 1 | Master Spec §9 |
| NFR-I18N-001 | Localization NFR | 1 | Master Spec §9 |
| NFR-COMP-001 | Compatibility | 1 | Master Spec §9 |
| NFR-OBS-001..002 | Observability | 2 | Master Spec §9 |
| NFR-DR-001..003 | Disaster Recovery | 3 | Master Spec §9 |
| NFR-MAINT-001 | Maintainability | 1 | Master Spec §9 |
| NFR-PORT-001 | Portability | 1 | Master Spec §9 |
| NFR-NET-001 | Weak Connectivity | 1 | Master Spec §9 |
| NFR-COST-001 | Cost Control | 1 | Master Spec §9 |
| **Total FRs** | | **~232** | |
| **Total NFRs** | | **~35** | |
| BAC-001..020 | Business Acceptance Criteria | 20 | Master Spec §10 |
| BR-*-001..015 | Business Rules | ~20 | Master Spec §7 |
| E2E-001..016 | Critical E2E Scenarios | 16 | Master Spec §37 |
| RG-01..12 | Release Gates | 12 | Master Spec §38 |
| EC-*-001..260 | Edge Cases | ~260 | Edge Case Spec |

## Edge Case Categories

Based on the Edge Case Traceability Catalogue:
- Authentication & Session (EC-AUTH-*)
- Profile & Privacy (EC-PROF-*)
- Genealogy & Tree (EC-GEN-*)
- Claims & Verification (EC-CLAIM-*)
- Change Requests (EC-CHG-*)
- Duplicates & Merge (EC-DUP-*)
- Relationships & Nata/Saino (EC-REL-*)
- Cultural Content (EC-CUL-*)
- Calendar & Tithi (EC-CAL-*)
- Jutho (EC-JUT-*)
- Notifications (EC-NOT-*)
- Invitations (EC-INV-*)
- Community & Moderation (EC-COM-*)
- Map & Location (EC-MAP-*)
- Chat & Communication (EC-CHAT-*)
- Administration (EC-ADM-*)
- Audit & Evidence (EC-AUD-*)
- Media & Files (EC-MEDIA-*)
- Privacy & Consent (EC-PRIV-*)
- Data Import (EC-IMP-*)

## Acceptance Gates (from SDLC Governance)

| Gate | Phase | Required Evidence |
|------|-------|-------------------|
| G0 | Mobilization | Named owners, repos, baseline acknowledged |
| G1 | Design/Architecture | UX flows, screen inventory, ADRs, schemas, threat models |
| G2 | Foundation | CI/CD, identity, audit, observability |
| G3 | Core Genealogy | Tree, search, claim, duplicate/merge, disputes pass reference tests |
| G4 | Feature Complete | All modules integrated; unapproved cultural features safely disabled |
| G5 | Release Candidate | Traceability complete, zero blocker/critical defects, security/DR/migration evidence |
| G6 | Go-Live | UAT sign-off, app store, operations handover, rollback plans, executive go/no-go |
| G7 | Operational Acceptance | Stabilization KPIs met, knowledge transfer |

## Unresolved Authority Gates

See [OPEN_GATES.md](OPEN_GATES.md) for the complete register of items requiring human/authority approval.

## Required Implementation Artifacts

Per SDLC Governance Spec and Master Requirements:

- [ ] UX/navigation specification and screen inventory
- [ ] Design system and component library
- [ ] Physical database schema (ERD, migrations, rollback)
- [ ] OpenAPI 3.x contract (all endpoints)
- [ ] Real-time event contract (WebSocket)
- [ ] Error catalogue (machine codes + i18n keys)
- [ ] Permission matrix (roles × capabilities)
- [ ] Notification catalogue
- [ ] Localization glossary
- [ ] Architecture Decision Records (ADR/)
- [ ] Threat model
- [ ] DPIA (Data Protection Impact Assessment)
- [ ] Test plan and UAT pack
- [ ] Infrastructure as Code
- [ ] CI/CD pipeline configuration
- [ ] Monitoring/alert catalogue
- [ ] Backup/restore runbook
- [ ] Disaster recovery runbook
- [ ] Incident response playbook
- [ ] Release/rollback procedures
- [ ] App store readiness material
- [ ] Operations manual
- [ ] Developer setup guide
- [ ] Administrator guide
- [ ] User guide

---

*Frozen baseline files must never be modified. All implementation artifacts belong outside `docs/baseline/v1.1/`.*
