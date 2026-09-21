# Baseline Conformance & Forensic Traceability Report

**Project**: Kashyap Gotra Adhikari Genealogy & Community Platform  
**Owner & Authority**: Jyphra Technology Pvt. Ltd.  
**Baseline Reference**: `D:\Jyphra\kashyap_family_tree\docs\baseline\source\Kashyap_Adhikari_Final_Implementation_Documentation_Baseline_v1.1\package`  
**Current Branch**: `feat/w2-genealogy-core`  
**Base Commit SHA**: `4bac6fa66f133639709be7a46d0320d17c9769ad`  
**Validation Tool**: `scripts/validate_traceability.py`  

---

## 1. Executive Summary & Traceability Repair

In accordance with strict SDLC governance, the previous traceability registers underwent an exhaustive audit and remediation. All generic completion assertions were eliminated and replaced with granular, classified records tied to concrete code files, specific test cases, and precise evidence.

### 1.1 Remediation Summary & Status Downgrades
1. **Release Gates (RG-05 Security, RG-09 Operations, RG-10 Store/Distribution)**:
   - *Previous Defect*: Marked `VERIFIED` using unrelated genealogy or claims tests.
   - *Correction*: Downgraded to `HUMAN_GATED` (mapped to `OPEN_GATES.md` HG-001, HG-006, HG-008, HG-009, HG-017). Release gates require operational sign-off, penetration testing, and store credential provisioning.
2. **Cultural & Ritual Business Rules (`BR-CONT-001`, `BR-JUT-001`)**:
   - *Previous Defect*: Marked `VERIFIED`.
   - *Correction*: Downgraded to `HUMAN_GATED` (mapped to HG-002 Cultural Sign-off and HG-003 Jutho/Sutak Authority). Ritual calculations remain strictly disabled with neutral advisory notices until human authority approval.
3. **Accessibility & User Experience Edge Cases (`EC-0249` through `EC-0260`)**:
   - *Previous Defect*: Marked `VERIFIED` citing only design-token unit tests.
   - *Correction*: Reclassified to `IMPLEMENTED_UNVERIFIED`. Design tokens and CSS contrast ratios are implemented, but full screen-reader and automated WCAG 2.2 AA audits remain scheduled for UAT.
4. **Accessibility Standard Reconciliation**:
   - *Previous Standard*: WCAG 2.1.
   - *Corrected Standard*: **WCAG 2.2 Level AA** in accordance with Master Specification §2.3 and NFR-A11Y.

---

## 2. Granular Inventory Counts by Record Type & Status

### 2.1 Requirements & Controls Register (`docs/execution/REQUIREMENTS_TRACEABILITY.csv`)
| Record Type | Total Extracted | Verified with Specific Evidence | Implemented Unverified | Human-Gated | Planned |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQUIREMENT (FR / NFR)** | 692 | 0 (Consolidated in Edge Cases) | 1 | 0 | 691 |
| **DATA_CONTROL (DAT)** | 75 | 0 | 0 | 0 | 75 |
| **BUSINESS_RULE (BR)** | 35 | 0 | 0 | 2 (`BR-CONT`, `BR-JUT`) | 33 |
| **GOVERNANCE_CONTROL (GOV / ROL)** | 23 | 0 | 0 | 0 | 23 |
| **RELEASE_GATE (RG / GATE)** | 12 | 0 | 0 | 12 (`RG-01`..`RG-12`) | 0 |
| **AUDIT_CONTROL (AUD)** | 6 | 0 | 0 | 0 | 6 |
| **Total Primary Controls** | **843** | **0** | **1** | **14** | **828** |

### 2.2 Edge Case & Negative Test Register (`docs/execution/EDGE_CASE_TRACEABILITY.csv`)
| Functional Module | Total Edge Cases | Verified (Passing Jest Tests) | Implemented Unverified | Human-Gated | Planned |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Genealogy Person & Relationships** | 16 | 16 | 0 | 0 | 0 |
| **Registration, OTP & Sessions** | 12 | 12 | 0 | 0 | 0 |
| **Profiles, Claims & Privacy** | 12 | 12 | 0 | 0 | 0 |
| **Nata/Saino Kinship Engine** | 12 | 0 | 0 | 12 (HG-002) | 0 |
| **Calendar, Tithi & Jutho** | 12 | 0 | 0 | 12 (HG-003, HG-004) | 0 |
| **Community Posts & Moderation** | 12 | 12 | 0 | 0 | 0 |
| **Events, Invitations & RSVP** | 12 | 12 | 0 | 0 | 0 |
| **Chat, Groups & Presence** | 16 | 16 | 0 | 0 | 0 |
| **Map & Spatial Location** | 10 | 10 | 0 | 0 | 0 |
| **Duplicate Detection & Merge** | 12 | 12 | 0 | 0 | 0 |
| **Administration, Roles & Audit** | 12 | 12 | 0 | 0 | 0 |
| **Accessibility & User Experience** | 12 | 0 | 12 (WCAG 2.2 AA) | 0 | 0 |
| **Operations & Release** | 12 | 0 | 0 | 0 | 12 |
| **Remaining Modules (API, Media, Sync, etc.)**| 98 | 0 | 0 | 0 | 98 |
| **Total Edge Cases** | **260** | **114** | **12** | **24** | **110** |

---

## 3. Automated Validation Results (`scripts/validate_traceability.py`)

```
========================================================
Validating: REQUIREMENTS_TRACEABILITY.csv
========================================================
Total Rows Evaluated: 843
Unique IDs: 843
Duplicate IDs: 0 (None)
Missing Code Files on Disk: 0 (None)
Missing Test Files on Disk: 0 (None)
Unsupported VERIFIED Claims: 0 (None)
Validation Result: PASSED

========================================================
Validating: EDGE_CASE_TRACEABILITY.csv
========================================================
Total Rows Evaluated: 260
Unique IDs: 260
Duplicate IDs: 0 (None)
Missing Code Files on Disk: 0 (None)
Missing Test Files on Disk: 0 (None)
Unsupported VERIFIED Claims: 0 (None)
Validation Result: PASSED

ALL TRACEABILITY REGISTERS VALIDATED WITH 100% INTEGRITY!
```

---

## 4. Specific Evidence for Verified Capabilities (Commit: `4bac6fa`)

| Requirement / Module | Specific Test File & Test Name | Verification Evidence |
| :--- | :--- | :--- |
| **FR-GEN-001 (Person CRUD)** | `services/api/test/genealogy.service.spec.ts`<br/>`GenealogyService > getPersonById` | Returns full person profile with names, Gotra, Kuldevata, parents, spouses, and children. |
| **FR-GEN-002 (DAG Cycle Guard)** | `services/api/test/genealogy.service.spec.ts`<br/>`GenealogyService > Directed Graph Cycle Detection` | Throws `BadRequestException(CYCLE_DETECTED)` when ancestor is linked as child. |
| **FR-AUTH-001 (OTP Expiry)** | `services/api/test/auth.service.spec.ts`<br/>`AuthService > requestOtp / verifyOtp` | Dispatches OTP with 5-minute expiry and verifies correctly, issuing JWT tokens. |
| **FR-AUTH-002 (Cooldown)** | `services/api/test/auth.service.spec.ts`<br/>`AuthService > Rate Limiting & Cooldown` | Throws `BadRequestException(OTP_RESEND_COOLDOWN)` within 60s cooldown window. |
| **FR-AUTH-003 (Lockout)** | `services/api/test/auth.service.spec.ts`<br/>`AuthService > Maximum Attempts` | Throws `BadRequestException(OTP_MAX_ATTEMPTS_EXCEEDED)` on 5th failed attempt. |
| **FR-CLM-001 (Claim Lifecycle)**| `services/api/test/claims.service.spec.ts`<br/>`ClaimsService > submitClaim` | Submits verification claim in SUBMITTED state with evidence files. |
| **FR-CLM-002 (2-Tier Approval)** | `services/api/test/claims.service.spec.ts`<br/>`ClaimsService > approveClaim` | Tier 1 Elder approval moves to `PENDING_SECOND_APPROVAL`; Tier 2 Admin activates. |
| **FR-CLM-003 (Anti-Hijack)** | `services/api/test/claims.service.spec.ts`<br/>`ClaimsService > Anti-Hijack Guard` | Throws `ConflictException(PERSON_ALREADY_CLAIMED)` on duplicate claim. |
| **FR-AUD-001 (Immutable Audit)**| `services/api/test/audit.service.spec.ts`<br/>`AuditService > recordEvent` | Logs actor, action, target, payload hash, IP address, and timestamp. |
| **FR-CUL-002 (Gotra Marriage)** | `services/api/test/cultural-rules.service.spec.ts`<br/>`CulturalRulesService > Gotra Marriage Guard` | Flags same-Gotra (Kashyap) candidates with cultural warning. |
| **FR-CUL-003 (Dual Sign-off)** | `services/api/test/cultural-rules.service.spec.ts`<br/>`CulturalRulesService > 2-Person Review` | Enforces Propose $\to$ Review (separate reviewer) $\to$ Senior Authority Approval. |
| **FR-COM-001 (Community Posts)**| `services/api/test/community.service.spec.ts`<br/>`CommunityService > createPost / listPosts` | Creates posts, toggles likes, appends comments, filters by branch. |
| **FR-COM-002 (Moderation)** | `services/api/test/community.service.spec.ts`<br/>`CommunityService > flagPost / moderatePost` | Flagged posts hidden from public feed until approved by moderator. |
| **FR-COM-003 (Events & RSVP)** | `services/api/test/community.service.spec.ts`<br/>`CommunityService > listEvents / rsvpEvent` | Records user RSVPs (`GOING`/`MAYBE`/`DECLINED`) and aggregates counts. |
| **FR-MAP-001 (Spatial Privacy)**| `services/api/test/map.service.spec.ts`<br/>`MapService > getHouseholds` | Returns district centroid clusters for unverified users, masking exact location. |
| **FR-CHT-001 (Chat & Messages)**| `services/api/test/chat.service.spec.ts`<br/>`ChatService > sendMessage / getMessages` | Direct and family branch group messaging with participant access guards. |

---

## 5. Artifact Links

- **Requirements Register**: [REQUIREMENTS_TRACEABILITY.csv](file:///D:/Jyphra/kashyap_family_tree/docs/execution/REQUIREMENTS_TRACEABILITY.csv)
- **Edge Case Register**: [EDGE_CASE_TRACEABILITY.csv](file:///D:/Jyphra/kashyap_family_tree/docs/execution/EDGE_CASE_TRACEABILITY.csv)
- **Implementation Plan**: [IMPLEMENTATION_PLAN.md](file:///D:/Jyphra/kashyap_family_tree/docs/execution/IMPLEMENTATION_PLAN.md)
- **Validation Script**: [validate_traceability.py](file:///D:/Jyphra/kashyap_family_tree/scripts/validate_traceability.py)
