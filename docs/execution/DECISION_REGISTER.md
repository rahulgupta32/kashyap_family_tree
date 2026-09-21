# Decision Register

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.

## Purpose

This register tracks technical interpretations, suspected requirement conflicts, and material design decisions that require documentation but not immediate Jyphra approval.

## Register

| ID | Date | Category | Decision/Observation | Rationale | Status | Escalation Required? |
|----|------|----------|---------------------|-----------|--------|---------------------|
| DR-001 | 2026-09-09 | Architecture | Adopted monorepo structure per baseline §29 recommendation | Single contract/version discipline, synchronized docs/tests/infra | Implemented | No |
| DR-002 | 2026-09-09 | Architecture | Flutter 3.x for mobile per ADR-001 | Baseline explicitly specifies Flutter for Android/iOS | Implemented | No |
| DR-003 | 2026-09-09 | Architecture | NestJS + TypeScript per ADR-003 | Baseline explicitly specifies NestJS modular backend | Implemented | No |
| DR-004 | 2026-09-09 | Architecture | Next.js + TypeScript per ADR-002 | Baseline explicitly specifies Next.js for admin portal | Implemented | No |
| DR-005 | 2026-09-09 | Architecture | PostgreSQL 16+ per ADR-004 | Baseline specifies PostgreSQL; v16 for latest features | Implemented | No |
| DR-006 | 2026-09-09 | Storage | All heavy storage on D: drive | Mandatory per project policy; C: has insufficient space | Implemented | No |
| DR-007 | 2026-09-09 | Security | Code kept proprietary (all rights reserved) | No license selected; Jyphra must explicitly choose (HG-001) | Active | Yes - License |
| DR-008 | 2026-09-09 | Cultural | Nata/Saino rules implemented as versioned config, disabled by default | Cannot activate without Community/Religious Representative sign-off (HG-002) | Active | Yes - Cultural |
| DR-009 | 2026-09-09 | Cultural | Jutho rules implemented as versioned config, disabled by default | Cannot activate without Community/Religious Representative sign-off (HG-003) | Active | Yes - Cultural |
| DR-010 | 2026-09-09 | Cultural | Tithi/calendar rules use adapter pattern with fallback | Provider/source requires religious authority approval (HG-004) | Active | Yes - Cultural |
| DR-011 | 2026-09-09 | iOS | iOS code is cross-platform via Flutter; signing deferred | Requires Apple Developer certificates and macOS CI (HG-007) | Active | Yes - External |
| DR-012 | 2026-09-09 | Git | GitHub `gh` CLI not authenticated; push via HTTPS git credentials | `gh auth login` requires interactive MFA/browser flow (HG-016) | Active | Yes - Credentials |
| DR-013 | 2026-09-09 | Availability | Baseline BRD says 99.5%; Master Spec §1.5 says 99.9% | Using 99.9% as the higher target from the more detailed spec. Jyphra may clarify. | Noted | No - using stricter |
| DR-014 | 2026-09-09 | Performance | BRD says p95 ≤ 2s API; Master Spec says p95 ≤ 500ms reads, ≤ 800ms writes | Using Master Spec targets as more granular. BRD was overall summary. | Noted | No - using stricter |

## Conflict Resolution Protocol

1. Check document precedence order (§6 of governance):
   1. Signed Jyphra change decision
   2. Final SDLC Execution Governance Specification
   3. Master Requirements & SDLC Specification
   4. Business Requirements Document
   5. Detailed behavior/edge-case specification
   6. Module catalogues, matrices, templates, supporting plans
2. Log the conflict here with both sources
3. Apply the higher-precedence document
4. If the conflict is material to business outcomes, flag for Jyphra review
5. Technical interpretations that don't change business outcomes are decided and documented as ADRs

---

*Last updated: 2026-09-09*
