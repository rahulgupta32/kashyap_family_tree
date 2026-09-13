# Milestone 3 Delivery Report: Persistent Genealogy Core, Person Search, Interactive Tree Navigation, Governed Duplicate Management, and Mobile Client Architecture

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Governing Baseline**: `Kashyap_Adhikari_Final_Implementation_Documentation_Baseline_v1.1`  
**Milestone**: Milestone 3 — Genealogy Core, Person Search, Interactive Family-Tree Navigation, Governed Duplicate Management, Privacy Governance & Mobile Architecture  
**Status**: ✅ COMPLETED & FULLY VERIFIED  
**Date**: 2026-09-13  
**Active Branch**: `feat/m3-genealogy-core`  
**Base Branch**: `develop`  

---

## 1. Executive Summary

Milestone 3 establishes the persistent genealogy core, person search, interactive family-tree canvas, governed duplicate management, privacy engine, authorized export, and mobile Flutter client architecture for the Kashyap Adhikari Family Tree platform. All implementations are backed by real PostgreSQL 16 on D: drive storage (`127.0.0.1:5434` / `kashyap_db`) and Redis 7 (`127.0.0.1:6379`).

All 7 user amendments and requirements have been strictly incorporated:
1. **Graph Concurrency Protection (Amendment 1)**: PostgreSQL transaction-scoped graph mutation lock via `pg_advisory_xact_lock(hashtext('kashyap_lineage_graph'))` acquired prior to validation or cycle detection in all relationship mutations and duplicate merges.
2. **Privacy Governance & Strict Minor Protection (Amendment 2)**: Rule-driven `PrivacyEngineService` enforcing `PRIV-FR-001..004, 007..008` with strict masking for minors (< 18 or uncertain age) and unverified/guest viewers, with dynamic Bikram Sambat age calculation.
3. **Pre-Creation Uncommitted Duplicate Evaluation (Amendment 3)**: Live evaluation endpoint `POST /genealogy/duplicates/evaluate` scoring potential duplicates with Trigram and phonetic matching before database write, plus concurrency-safe evaluation lock during creation.
4. **Governed Atomic Duplicate Merge (Amendment 4)**: Atomic merge transaction with deterministic ID locking, version conflict detection (`STALE_UPDATE_DETECTED`), dual-account claim protection (`CANNOT_MERGE_CLAIMED_PERSONS`), link migration, non-primary alias preservation, immutable audit outbox snapshots, and canonical pointer resolution.
5. **Authorized Privacy-Filtered Export (Amendment 5)**: JSON and CSV export (`POST /genealogy/export`) enforcing branch authorization and role-based privacy masking, restricting exported links to pairs where both endpoints are in the exported person set.
6. **Flutter Mobile Client Architecture (Amendment 6)**: Multi-screen Flutter mobile architecture in `apps/mobile` adhering to Modern Heritage design tokens, Riverpod/service patterns, bilingual support, and read-only tree canvas.
7. **Comprehensive Verification & Regression Suite (Amendment 7)**: 100% pass rate across 12 unit test suites (78 tests), 7 real PostgreSQL integration test suites (82 tests), and Playwright E2E browser tests. Total 160 automated backend tests (100% pass).

---

## 2. Implemented Architecture & Baseline Requirements

### A. Database Enhancements (`database/migrations/004_genealogy_m3_enhancements.sql` & `005_person_names_alias_constraint.sql`)
- Added optimistic locking `version INT NOT NULL DEFAULT 1` on `persons`.
- Added composite and covering indexes:
  - `idx_parent_links_child` on `parent_links(child_id)`
  - `idx_spouse_links_spouse` on `spouse_links(spouse_id)`
  - `idx_duplicate_candidates_status` on `duplicate_candidates(status)`
  - `idx_duplicate_merges_surviving_merged` on `duplicate_merges(surviving_person_id, merged_person_id)`
  - `idx_persons_archived_living` on `persons(is_archived, living_status)`
- Migration 005 replaces rigid unique constraint with partial unique index `idx_person_names_unique_primary ON person_names(person_id, language) WHERE is_primary = TRUE`, supporting unlimited non-primary aliases for absorbed records during duplicate merges.

### B. Shared Contracts & Localization (`@kashyap/contracts`, `@kashyap/localization`)
- Added complete DTOs: `PersonSearchQueryDto`, `PersonSearchResponseDto`, `EvaluateProposedPersonDto`, `DuplicateCandidateDto`, `DuplicateCompareDto`, `MergePersonsDto`, `MergeResultDto`, `GenealogyExportRequestDto`, `GenealogyExportResponseDto`, `AdminCreatePersonDto`, `AdminUpdatePersonDto`, `AdminArchivePersonDto`, `TreeNodeDto` (with `ancestors` array).
- Machine error codes catalogue & bilingual messages: `STALE_UPDATE_DETECTED (GEN_3010)`, `JUSTIFICATION_REQUIRED (ADM_3011)`, `DUPLICATE_MERGE_CYCLE (DUP_5003)`, `CANNOT_MERGE_CLAIMED_PERSONS (DUP_5005)`, `DUPLICATE_CANDIDATE_NOT_FOUND (DUP_5006)`, `CANNOT_MERGE_SAME_PERSON (DUP_5007)`, `DUPLICATE_CANDIDATE_DETECTED (DUP_5001)`, `MERGE_CONFLICT_UNRESOLVED (DUP_5008)`, `DUAL_BRANCH_AUTHORITY_REQUIRED (BR_3002)`, `MAX_TREE_DEPTH_EXCEEDED (GEN_3005)`.

### C. Backend Domain Services (`services/api`)
- `PersonRepository`: Trigram similarity searches, canonical duplicate merge pointer resolution, optimistic locking update queries, and profile snapshot loading.
- `GenealogyLinkRepository`: Transaction-scoped advisory locking (`pg_advisory_xact_lock`), recursive CTE ancestry cycle detection with depth > 100 fail-closed bounds, bidirectional link queries, and merge relationship migration.
- `DuplicateRepository`: Candidate queue querying, candidate status resolution, uncommitted candidate matching, and merge history tracking.
- `SearchService`: Full bilingual search, branch and generation filtering, pagination, and viewer-context privacy transformation.
- `PrivacyEngineService`: Contextual visibility rules (Public, Verified Community, Private), living status checks, branch admin scope verification, dynamic Bikram Sambat age calculation, and strict minor protection (< 18 / uncertain age masking).
- `DuplicateService`: Side-by-side comparison matrix, live uncommitted duplicate evaluation, candidate resolution, material conflict validation, account-link transfer, and governed atomic merge with alias preservation.
- `GenealogyService`: CRUD operations with mandatory justification reasons, version increments, authoritative duplicate pre-creation evaluation requiring `allowDuplicateOverride: true`, dual-branch authority enforcement on link additions, recursive tree hierarchy generation with ancestor expansion, strongly typed DI with atomic `audit_outbox` persistence, and privacy-filtered JSON/CSV export.

### D. Admin Web Application (`apps/admin`)
- `/people`: Bilingual search bar, generation & branch filters, pagination, CSV/JSON export actions, and "Add Person" modal with live duplicate pre-warning.
- `/people/[id]`: Complete profile details, parents/spouses/children relationship management, edit modal with mandatory justification and version tracking, and soft-archive.
- `/tree`: Interactive visual tree canvas with pan/zoom/reset, focus person search selector, and node detail drawer.
- `/duplicates`: Duplicate candidate queue, side-by-side comparison difference matrix, conflict highlighting, dismissal, and governed merge dialog.

### E. Flutter Mobile Architecture (`apps/mobile`)
- `lib/theme/app_theme.dart`: Modern Heritage theme tokens (Heritage Brown `#4A2C1A`, Saffron `#D18B28`, Warm Cream `#FFF8ED`).
- `lib/models/`: Strongly-typed Dart models (`Person`, `PersonDetail`, `TreeNode`).
- `lib/services/genealogy_api_service.dart`: HTTP API client for search, person detail, and tree fetching.
- `lib/screens/`: `PersonSearchScreen`, `PersonDetailScreen`, and `ReadOnlyTreeScreen` with pan/zoom interactive viewer.

---

## 3. Verification & Test Evidence

### A. Real Nest AppModule & HTTP Integration Tests (`test/genealogy-http.integration.spec.ts`)
- `should successfully create a new person and atomically persist audit_outbox entry`: PASS
- `should block creation of duplicate candidate without explicit allowDuplicateOverride (DUP-FR-001)`: PASS
- `should allow duplicate creation when allowDuplicateOverride is true and record override in audit outbox`: PASS
- `should reject person creation if justification is missing or boilerplate`: PASS
- `should update person record, increment version, and record outbox entry`: PASS
- `should reject stale update with version mismatch`: PASS
- `should reject update if version is missing`: PASS
- `should reject self-link as parent`: PASS
- `should detect and reject cycle when attempting to link descendant as parent (C -> A)`: PASS
- `should enforce dual-branch authority when branch admin tries to link record from another branch`: PASS
- `should enforce dual-branch authority when creating person with embedded cross-branch parent link`: PASS
- `should reject merge if material conflict exists without explicit field resolution`: PASS
- `should successfully merge records, preserve alias (migration 005), and record audit outbox`: PASS
- `should resolve duplicate candidate to NOT_A_DUPLICATE and record audit outbox`: PASS
- `should completely roll back person creation when audit outbox insertion fails`: PASS
- `should completely roll back parent relationship link when audit outbox insertion fails`: PASS

### B. Real PostgreSQL Integration Test Suite (`pnpm --filter @kashyap/api test:integration`)
- **Total Integration Tests**: 7 Suites, 82 Tests, 100% PASS.

### C. Unit Test Suite (`pnpm --filter @kashyap/api test:unit`)
- **Total Unit Tests**: 12 Suites, 78 Tests, 100% PASS.

### D. Playwright End-to-End Browser Tests (`pnpm test:e2e`)
- **Suite**: `e2e/genealogy-flow.spec.ts` & `e2e/login-flow.spec.ts`
- **Total E2E Tests**: 8 Tests, 100% PASS.

### E. Monorepo Build Status (`pnpm -r build`)
- `@kashyap/contracts`: Build PASSED
- `@kashyap/localization`: Build PASSED
- `@kashyap/design-tokens`: Build PASSED
- `@kashyap/test-fixtures`: Build PASSED
- `@kashyap/api`: Build PASSED (NestJS dist generated)
- `@kashyap/admin`: Build PASSED (8 Next.js static/dynamic routes compiled cleanly)

---

## 4. Preservation & Environmental Compliance
- Real PostgreSQL persistence on D: storage (`127.0.0.1:5434`, `/mnt/kashyap_pg/pgdata`) verified.
- Real Redis persistence on D: storage (`127.0.0.1:6379`, `/mnt/kashyap_pg/redis`) verified.
- Existing migrations `000..003` strictly preserved; new migration `004` applied.
- Unrelated WSL clusters and workloads (`vidyarthi`, `mala_chem`) preserved intact.
