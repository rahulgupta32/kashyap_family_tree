# ADR-009: Versioned Data-Driven Cultural & Kinship Rule Engine

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
Nata/Saino (kinship terminology), Jutho (mourning periods & restrictions), and Tithi/Shraddha rules are governed by religious and community tradition. Engineers must NOT hardcode cultural logic. Rules require multi-party authority sign-off, regional dialect variations, and immutable versioning.

## Decision
Implement a **Data-Driven Rule Engine** (`DomainRuleEngine`) storing rules as declarative JSON structures in PostgreSQL (`domain_rulesets` table) with:
1. Versioning and rollback support (`version`, `status`: DRAFT, REVIEW, APPROVED, ACTIVE, ARCHIVED).
2. Two-person cryptographic authority signing (Cultural Reviewer + Senior Authority).
3. "Disabled-by-default" safety gate returning neutral fallback text when an unverified rule is encountered.
4. Deterministic kinship path traversal algorithm mapping graph paths (e.g. `M.F.B.S`) to term entries.
