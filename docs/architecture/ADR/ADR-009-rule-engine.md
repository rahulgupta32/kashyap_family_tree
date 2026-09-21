# ADR-009: Versioned Data-Driven Cultural & Kinship Rule Engine

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: REL-FR-001..013, JUT-FR-001..009, CAL-FR-001..013, CUL-FR-001..010, Open Gates HG-002, HG-003, HG-004

## 1. Context
Nepali kinship terminology (Nata/Saino), mourning rules (Jutho/Sutok), and Tithi/Shraddha obligations are rooted in cultural and religious tradition. Software developers must NEVER invent or hardcode cultural rules. All rules must be versioned, data-driven, and governed by designated religious and community authorities.

## 2. Decision
Implement a **Data-Driven Rule Engine** (`DomainRuleEngine`) storing rules as declarative JSON structures in PostgreSQL (`domain_rulesets` table) with:
1. Versioning and status lifecycle (`DRAFT` -> `UNDER_REVIEW` -> `APPROVED` -> `ACTIVE` -> `ARCHIVED`).
2. Two-person cryptographic authority signing (Cultural Reviewer + Senior Religious Authority).
3. "Disabled-by-default" safety gate returning neutral fallback text when an unverified rule is encountered.
4. Deterministic graph path traversal algorithm mapping kinship paths (e.g., `F.B.S` -> "भतिज / दाजु") to validated term entries.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Hardcoded TypeScript Switch/Case** | Dangerous: violates cultural governance mandate; requires code redeployment to correct cultural disputes or dialect differences. |
| **External Rule Engine (Drools / JSON-Rules-Engine)** | Heavyweight and lacks domain-specific bidirectional kinship path traversal logic. |

## 4. Consequences
- **Positive**: Clean separation of engineering code and cultural knowledge; zero code deployment needed to update rules; full auditability and rollback.
- **Negative**: Graph path traversal and rule lookup must be optimized with in-memory caching.

## 5. Security & Privacy Impact
- Unapproved rules cannot leak into production without two-person cryptographic signature verification.

## 6. Scaling Impact
- Active rulesets cached in Redis; sub-millisecond kinship path evaluation.

## 7. Operational Impact
- Admin console UI for cultural committee review and electronic signature approval.
