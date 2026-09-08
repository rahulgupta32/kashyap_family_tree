# Edge Case Traceability Matrix

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Source**: Kashyap_Adhikari_Detailed_Behaviour_Edge_Case_Exception_Negative_Test_Specification_v1.0  
**Source**: Kashyap_Adhikari_Edge_Case_Exception_Negative_Test_Traceability_Catalogue_v1.0  
**Last Updated**: 2026-09-09

## Purpose

Track implementation and test coverage for all 260 documented edge cases. Each applicable case requires automated test coverage or a controlled manual-test script with expected evidence.

## Legend

- **Coverage**: ⬜ Not Started | 🔄 In Progress | ✅ Automated | 📋 Manual Script | 🚫 Blocked
- **Priority**: P1 (Critical) | P2 (High) | P3 (Medium) | P4 (Low)

## Edge Cases by Module

*(Full catalogue to be expanded from the Edge Case Traceability Catalogue xlsx sheet2 — 263 rows of detailed edge cases)*

### Authentication (EC-AUTH)

| EC ID | Description | Related Req | Priority | Test Type | Coverage |
|-------|-------------|-------------|----------|-----------|----------|
| EC-AUTH-001 | Invalid phone number format | AUTH-FR-001 | P1 | Unit, Integration | ⬜ |
| EC-AUTH-002 | Expired OTP entry | AUTH-FR-003 | P1 | Unit, Integration | ⬜ |
| EC-AUTH-003 | Maximum OTP attempt exceeded | AUTH-FR-003 | P1 | Unit, Security | ⬜ |
| EC-AUTH-004 | OTP resend during cooldown | AUTH-FR-004 | P2 | Unit | ⬜ |
| EC-AUTH-005 | Concurrent sessions on multiple devices | AUTH-FR-009 | P2 | Integration | ⬜ |
| EC-AUTH-006 | Login with suspended account | AUTH-FR-010 | P1 | Unit, Integration | ⬜ |
| EC-AUTH-007 | Login with deleted account | AUTH-FR-010 | P1 | Unit | ⬜ |
| EC-AUTH-008 | OTP SMS delivery failure | AUTH-FR-002 | P1 | Integration | ⬜ |
| EC-AUTH-009 | Session token revocation race condition | AUTH-FR-007 | P2 | Integration | ⬜ |
| EC-AUTH-010 | Rapid repeated login/logout | AUTH-FR-007 | P3 | Security | ⬜ |

### Genealogy (EC-GEN)

| EC ID | Description | Related Req | Priority | Test Type | Coverage |
|-------|-------------|-------------|----------|-----------|----------|
| EC-GEN-001 | Self-referential parent link | GEN-FR-007 | P1 | Unit | ⬜ |
| EC-GEN-002 | Ancestry cycle (A→B→C→A) | GEN-FR-008 | P1 | Unit, Integration | ⬜ |
| EC-GEN-003 | Person with no parents or children | GEN-FR-002 | P2 | Unit | ⬜ |
| EC-GEN-004 | Very deep genealogy tree (>20 gen) | GEN-FR-010 | P2 | Performance | ⬜ |
| EC-GEN-005 | Person with multiple marriages | GEN-FR-006 | P2 | Unit | ⬜ |
| EC-GEN-006 | Concurrent genealogy edits to same person | CHG-FR-010 | P1 | Integration | ⬜ |
| EC-GEN-007 | Cross-branch marriage link | GEN-FR-012 | P2 | Integration | ⬜ |
| EC-GEN-008 | Historical person with unknown dates | GEN-FR-004 | P2 | Unit | ⬜ |
| EC-GEN-009 | Name with special Unicode characters | GEN-FR-003 | P2 | Unit | ⬜ |
| EC-GEN-010 | Delete archived person re-creation attempt | GEN-FR-017 | P2 | Unit | ⬜ |

### Claims & Verification (EC-CLAIM)

| EC ID | Description | Related Req | Priority | Test Type | Coverage |
|-------|-------------|-------------|----------|-----------|----------|
| EC-CLAIM-001 | Duplicate active claim for same person | CLAIM-FR-009 | P1 | Unit, Integration | ⬜ |
| EC-CLAIM-002 | Claim for already-linked person | CLAIM-FR-009 | P1 | Unit | ⬜ |
| EC-CLAIM-003 | Verifier reviews own-family claim | CLAIM-FR-008 | P1 | Security | ⬜ |
| EC-CLAIM-004 | Person merged during claim review | CLAIM-FR-009 | P2 | Integration | ⬜ |
| EC-CLAIM-005 | Evidence file upload exceeds size limit | CLAIM-FR-003 | P2 | Unit | ⬜ |

### Duplicate & Merge (EC-DUP)

| EC ID | Description | Related Req | Priority | Test Type | Coverage |
|-------|-------------|-------------|----------|-----------|----------|
| EC-DUP-001 | Merge two persons with conflicting parents | DUP-FR-007 | P1 | Integration | ⬜ |
| EC-DUP-002 | Merge would create ancestry cycle | DUP-FR-005 | P1 | Unit, Integration | ⬜ |
| EC-DUP-003 | Merge person with active claims | DUP-FR-005 | P2 | Integration | ⬜ |
| EC-DUP-004 | Three-way duplicate candidate | DUP-FR-003 | P2 | Integration | ⬜ |
| EC-DUP-005 | Merge person linked to user account | DUP-FR-006 | P1 | Integration, E2E | ⬜ |

### Relationship & Nata/Saino (EC-REL)

| EC ID | Description | Related Req | Priority | Test Type | Coverage |
|-------|-------------|-------------|----------|-----------|----------|
| EC-REL-001 | No verified path between persons | REL-FR-001 | P2 | Unit | ⬜ |
| EC-REL-002 | Multiple relationship paths | REL-FR-009 | P2 | Unit | ⬜ |
| EC-REL-003 | Unmapped relationship path | REL-FR-012 | P2 | Unit | ⬜ |
| EC-REL-004 | Very distant relationship (>15 hops) | REL-FR-010 | P2 | Performance | ⬜ |
| EC-REL-005 | Relationship through adoptive parent | REL-FR-001 | P2 | Unit | ⬜ |

*(Remaining edge case categories: EC-CUL, EC-CAL, EC-JUT, EC-NOT, EC-INV, EC-COM, EC-MAP, EC-CHAT, EC-ADM, EC-AUD, EC-MEDIA, EC-PRIV, EC-IMP — to be populated from the full 260-item catalogue)*

## Coverage Summary

| Category | Total ECs | Automated | Manual Script | Blocked | Not Started |
|----------|-----------|-----------|---------------|---------|-------------|
| AUTH | ~15 | 0 | 0 | 0 | ~15 |
| GEN | ~30 | 0 | 0 | 0 | ~30 |
| CLAIM | ~15 | 0 | 0 | 0 | ~15 |
| CHG | ~20 | 0 | 0 | 0 | ~20 |
| DUP | ~15 | 0 | 0 | 0 | ~15 |
| REL | ~15 | 0 | 0 | 0 | ~15 |
| CUL | ~10 | 0 | 0 | 0 | ~10 |
| CAL | ~15 | 0 | 0 | 0 | ~15 |
| JUT | ~10 | 0 | 0 | 0 | ~10 |
| NOT | ~15 | 0 | 0 | 0 | ~15 |
| INV | ~15 | 0 | 0 | 0 | ~15 |
| COM | ~20 | 0 | 0 | 0 | ~20 |
| MAP | ~10 | 0 | 0 | 0 | ~10 |
| CHAT | ~20 | 0 | 0 | 0 | ~20 |
| ADM | ~15 | 0 | 0 | 0 | ~15 |
| AUD | ~5 | 0 | 0 | 0 | ~5 |
| MEDIA | ~10 | 0 | 0 | 0 | ~10 |
| PRIV | ~10 | 0 | 0 | 0 | ~10 |
| IMP | ~5 | 0 | 0 | 0 | ~5 |
| **Total** | **~260** | **0** | **0** | **0** | **~260** |

---

*This matrix will be expanded with full edge case details as each module is implemented. The complete catalogue is extracted from the baseline xlsx.*
