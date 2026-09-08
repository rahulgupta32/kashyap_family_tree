# Kashyap Adhikari Family Tree — Implementation Plan

**Owner**: Jyphra Technology Pvt. Ltd.  
**Status**: In Execution  
**Created**: 2026-09-09  
**Baseline**: v1.1 (Frozen 2026-09-08, all 12 files SHA256 verified ✅)

---

## Executive Summary

This plan implements the complete Release 1.0 of the Kashyap Adhikari Family Tree platform — a genealogy and community platform for the Kashyap Gotra Adhikari community in Nepal. The platform comprises:

- **Flutter mobile app** (Android + iOS)
- **Next.js admin portal** (web)
- **NestJS modular backend** (REST API + WebSocket)
- **PostgreSQL** database with managed backups
- **Redis** for caching/rate limiting
- **S3-compatible object storage** for media
- **Background workers** for notifications, media processing, imports

Per baseline ADR-001 through ADR-012.

## Architecture Decisions (Baseline)

| ADR | Decision | Stack |
|-----|----------|-------|
| ADR-001 | Flutter for mobile | Dart/Flutter 3.x |
| ADR-002 | Next.js + TypeScript for admin portal | Next.js 14+, React, TypeScript |
| ADR-003 | NestJS + TypeScript modular backend | NestJS 10+, TypeScript strict |
| ADR-004 | PostgreSQL for transactional DB | PostgreSQL 16+ |
| ADR-005 | Redis for cache/rate limiting | Redis 7+ |
| ADR-006 | S3-compatible object storage | MinIO (dev), AWS S3/equivalent (prod) |
| ADR-007 | REST/OpenAPI + WebSocket | OpenAPI 3.x, Socket.IO |
| ADR-008 | PostgreSQL search baseline | pg_trgm, full-text search |
| ADR-009 | Versioned data-driven rule engine | JSON rule configs with approval workflow |
| ADR-010 | Containerized managed-cloud deployment | Docker, IaC (Terraform/Pulumi) |
| ADR-011 | Append-only audit persistence | Immutable audit_logs table |
| ADR-012 | Provider-adapter interfaces | Adapter pattern for OTP, push, maps, Tithi |

## SDLC Phases & Gates

| Phase | Gate | Description | Duration |
|-------|------|-------------|----------|
| P0 | G0 | Mobilization & baseline freeze | Complete ✅ |
| P1 | G1 | Discovery, UX & architecture | 4-6 weeks |
| P2 | G2 | Engineering foundations | 3-4 weeks |
| P3 | G3 | Core genealogy & governance | 8-10 weeks |
| P4 | G4 | Community & cultural capabilities | 6-8 weeks |
| P5 | G5 | Integration, migration & hardening | 4-6 weeks |
| P6 | G6 | UAT, stores & launch | 4-6 weeks |
| P7 | G7 | Stabilization & handover | Ongoing |

## Engineering Workstreams

### W1: Platform Foundation (G2)
- Repository structure, CI/CD, environments
- Authentication (OTP), base RBAC, session management
- Observability, localization framework, design system
- **Requirements**: AUTH-FR-001..012, I18N-FR-001..005, NFR-OBS-001..002

### W2: Genealogy Core (G3)
- Person, names, branches, direct links (ParentLink, SpouseLink)
- Initial import tooling, family tree rendering
- Search, claims, change requests, duplicate detection/merge
- **Requirements**: GEN-FR-001..018, SRCH-FR-001..008, CLAIM-FR-001..012, CHG-FR-001..015, DUP-FR-001..009

### W3: Relationship & Domain Rules (G3)
- Graph traversal engine, Nata/Saino rule engine
- Relationship path computation, terminology mapping
- Rule versioning/testing/approval workflow
- **Requirements**: REL-FR-001..013

### W4: Culture & Content (G4)
- Cultural content CMS, draft/review/approve/publish lifecycle
- Bilingual content management, media support
- **Requirements**: CUL-FR-001..010

### W5: Calendar, Tithi & Jutho (G4)
- BS/AD/Tithi calendar support, event management
- Jutho calculation engine with rule versioning
- Shraddha/84 Puja reminders
- **Requirements**: CAL-FR-001..013, JUT-FR-001..009

### W6: Invitations & Notifications (G4)
- Follow model, notification preferences
- Genealogy-based audience resolution
- Digital invitations, RSVP, push notifications
- **Requirements**: NOT-FR-001..011, INV-FR-001..012

### W7: Community & Map (G4)
- Community posts, moderation, reporting/blocking
- Household/community map with privacy controls
- **Requirements**: COM-FR-001..014, MAP-FR-001..007

### W8: Communication (G4)
- 1:1 and group chat, real-time WebSocket transport
- Media sharing, read receipts, offline retry
- Block/report/safety controls
- **Requirements**: CHAT-FR-001..014

### W9: Administration (G4-G5)
- Admin portal across all modules
- Claims queue, genealogy editor, merge console
- Content CMS, moderation, rules, imports, audit
- **Requirements**: ADM-FR-001..016

### W10: Quality & Hardening (G5)
- Performance testing, security scanning, penetration testing
- Accessibility, localization QA
- Migration rehearsal, DR testing, UAT
- **Requirements**: NFR-* (all)

## Monorepo Structure

```
kashyap_family_tree/
├── apps/
│   ├── mobile/              # Flutter Android/iOS
│   └── admin/               # Next.js TypeScript admin portal
├── services/
│   ├── api/                 # NestJS REST API + domain modules
│   ├── realtime/            # WebSocket gateway
│   └── worker/              # Background job processors
├── packages/
│   ├── contracts/           # Shared API schemas/types
│   ├── design-tokens/       # Design system tokens
│   ├── localization/        # i18n keys and translations
│   └── test-fixtures/       # Sanitized test data
├── database/
│   ├── migrations/          # Versioned DB migrations
│   ├── seeds/               # Development seed data
│   └── reference-data/      # Branch, generation reference data
├── infra/
│   ├── docker/              # Docker Compose for local dev
│   ├── environments/        # Environment configs
│   └── monitoring/          # Alert rules, dashboards
├── docs/
│   ├── baseline/            # Frozen v1.1 baseline (never modify)
│   ├── execution/           # Implementation tracking
│   ├── architecture/        # ADRs
│   ├── api/                 # OpenAPI specs
│   ├── guides/              # Developer/user guides
│   └── privacy/             # Privacy policies
├── tests/
│   ├── e2e/                 # End-to-end tests
│   ├── performance/         # Load/stress tests
│   ├── security/            # Security test scripts
│   └── domain-reference/    # Signed domain rule test cases
├── scripts/                 # Build/deploy utilities
├── .github/                 # CI/CD workflows
└── tools/                   # Dev tool configs
```

## D-Drive Storage Layout

| Path | Purpose |
|------|---------|
| `D:\Jyphra\kashyap_family_tree\` | Repository workspace |
| `D:\Jyphra\kashyap_family_tree_data\` | PostgreSQL data, Redis data, MinIO storage |
| `D:\Jyphra\dev-cache\` | npm, pnpm, pub, pip, Gradle caches |
| `D:\Jyphra\dev-tools\` | Flutter SDK, Android SDK, Node.js |
| `D:\Jyphra\containers\` | Docker data root |
| `D:\Jyphra\temp\kashyap_family_tree\` | Build temp, test artifacts |
| `D:\Jyphra\backups\kashyap_family_tree\` | Local dev backups |

## Human/Authority Gates (OPEN_GATES)

These items require explicit human approval and cannot be completed autonomously:

| Gate ID | Description | Authority | Status |
|---------|-------------|-----------|--------|
| HG-001 | Software license selection | Jyphra executive | ⏳ Pending |
| HG-002 | Nata/Saino rule catalogue sign-off | Community/Religious Representative | ⏳ Pending |
| HG-003 | Jutho rule catalogue sign-off | Community/Religious Representative | ⏳ Pending |
| HG-004 | Tithi/Shraddha rules/source approval | Religious Representative + PO | ⏳ Pending |
| HG-005 | Cultural content canon approval | Governing Committee | ⏳ Pending |
| HG-006 | Nepal legal/privacy review | Nepal-qualified counsel | ⏳ Pending |
| HG-007 | Apple Developer certificates/profiles | Jyphra / Apple | ⏳ Pending |
| HG-008 | Production cloud provider selection | Jyphra executive | ⏳ Pending |
| HG-009 | OTP/SMS provider contract | Jyphra procurement | ⏳ Pending |
| HG-010 | Push notification credentials (FCM/APNs) | Jyphra / Google / Apple | ⏳ Pending |
| HG-011 | Maps API key procurement | Jyphra procurement | ⏳ Pending |
| HG-012 | Production data migration authorization | Jyphra PO + Data Steward | ⏳ Pending |
| HG-013 | App Store submission authorization | Jyphra executive | ⏳ Pending |
| HG-014 | Production deployment go-live | Jyphra executive (G6) | ⏳ Pending |
| HG-015 | Docker Desktop D-drive configuration | Jyphra DevOps | ⏳ Pending |
| HG-016 | GitHub authentication (`gh auth login`) | Developer | ⏳ Pending |
| HG-017 | Branch protection rules setup | Repository owner | ⏳ Pending |

## Immediate Execution Order

### Phase 1: Foundation (Current Sprint)
1. ✅ D-drive storage preflight
2. ✅ Baseline verification (SHA256)
3. ✅ Repository initialization
4. ✅ Core documentation structure
5. 🔄 Execution documents (this plan, traceability, registers)
6. ⬜ NestJS backend scaffold
7. ⬜ PostgreSQL schema baseline (core tables)
8. ⬜ Flutter mobile app scaffold
9. ⬜ Next.js admin portal scaffold
10. ⬜ Docker Compose for local development
11. ⬜ CI/CD pipeline (GitHub Actions)
12. ⬜ Authentication module (OTP)

### Phase 2: Genealogy Core
13. ⬜ Person model and CRUD
14. ⬜ Branch/generation management
15. ⬜ ParentLink/SpouseLink with cycle detection
16. ⬜ Family tree API and rendering
17. ⬜ Profile claiming workflow
18. ⬜ Genealogy change request workflow
19. ⬜ Duplicate detection and merge
20. ⬜ Search with Nepali/English normalization

### Phase 3: Relationship & Rules Engine
21. ⬜ Graph traversal engine
22. ⬜ Nata/Saino rule engine (configurable, disabled until HG-002)
23. ⬜ Jutho calculation engine (configurable, disabled until HG-003)
24. ⬜ Rule versioning and approval workflow

### Phase 4: Community & Communication
25. ⬜ Cultural content CMS
26. ⬜ Calendar/Tithi/BS support
27. ⬜ Events and invitations with RSVP
28. ⬜ Community posts and moderation
29. ⬜ Household map with privacy
30. ⬜ Real-time chat (1:1 + groups)
31. ⬜ Notifications and follow system

### Phase 5: Integration & Hardening
32. ⬜ Admin portal full integration
33. ⬜ Import/migration tooling
34. ⬜ Performance testing
35. ⬜ Security hardening and scanning
36. ⬜ Accessibility and localization QA
37. ⬜ Backup/restore and DR testing
38. ⬜ UAT preparation

## Verification Plan

### Automated Tests
- Unit tests: `npm test` (backend), `flutter test` (mobile), `npm test` (admin)
- Integration tests: `npm run test:integration` (against test DB)
- E2E tests: `npm run test:e2e`
- Security scans: SAST, dependency audit, secret scanning in CI

### Manual Verification
- Domain rule reference test execution
- UAT by Jyphra stakeholders
- iOS device testing (requires macOS CI / physical device)
- Production-like restore rehearsal
- Penetration testing

---

*This plan implements the frozen baseline v1.1. No feature is deferred. Cultural rules are implemented as configurable engines with disabled-by-default activation gates.*
