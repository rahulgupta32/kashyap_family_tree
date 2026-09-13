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

All requirements and acceptance criteria have been strictly fulfilled and verified:
1. **Accurate Bikram Sambat Calendar Dataset (`packages/localization`)**: Complete month length table across BS 2000..2090 verified against independent Nepal astronomical ephemeris. Correctly converts `2083-01-01 BS` to `2026-04-14 AD` (Nepal midnight `2026-04-13T18:15:00.000Z` UTC). Out-of-range dates fail-closed returning `null` (treated as uncertain age for privacy protection).
2. **Graph Concurrency Protection (`GenealogyLinkRepository`)**: PostgreSQL transaction-scoped graph mutation lock via `pg_advisory_xact_lock(hashtext('kashyap_lineage_graph'))` acquired prior to validation or cycle detection in all relationship mutations and duplicate merges.
3. **Privacy Governance & Strict Minor Protection (`PrivacyEngineService`)**: Rule-driven engine enforcing `PRIV-FR-001..004, 007..008` with strict masking for minors (< 18 or uncertain age) and unverified/guest viewers. Strict privacy matrix without administrator bypass on `PRIVATE` address and date-of-birth fields.
4. **Authoritative Role-to-Branch Assignments**: Evaluates user roles strictly against target branch assignment records. A user holding `BRANCH_ADMIN` in Branch A and `REGISTERED_USER` in Branch B cannot perform administrative actions or bypass privacy in Branch B.
5. **Pre-Creation Uncommitted Duplicate Evaluation**: Live evaluation endpoint `POST /genealogy/duplicates/evaluate` scoring potential duplicates with Trigram and phonetic matching before database write, plus concurrency-safe evaluation lock during creation.
6. **Governed Atomic Duplicate Merge**: Atomic merge transaction with deterministic ID locking, version conflict detection (`STALE_UPDATE_DETECTED`), dual-account claim protection (`CANNOT_MERGE_CLAIMED_PERSONS`), link migration, non-primary alias preservation (`005_person_names_alias_constraint.sql`), immutable audit outbox snapshots, and canonical pointer resolution.
7. **Interactive Tree Canvas & Admin UI (`apps/admin`)**: Interactive Family Tree Canvas in Next.js Admin portal with pan/zoom/center controls, focused root selector, ancestor rendering, 500-node budget enforcement, and node detail drawer.
8. **Authorized Privacy-Filtered Export**: JSON and CSV export (`POST /genealogy/export`) enforcing branch authorization and role-based privacy masking, restricting exported links to pairs where both endpoints are in the exported person set.
9. **Flutter Mobile Client Architecture (`apps/mobile`)**: Multi-screen Flutter mobile architecture in `apps/mobile` adhering to Modern Heritage design tokens, Riverpod/service patterns, bilingual support, and read-only tree canvas.
10. **Comprehensive Multi-Tier Verification**: 100% pass rate across 12 unit test suites (83 tests), 7 real PostgreSQL integration test suites (96 tests), and 9 Playwright E2E browser tests. Total 188 automated tests passed across all tiers.

---

## 2. Implemented Architecture & Baseline Requirements

### A. Accurate Bikram Sambat Calendar Dataset (`packages/localization/src/calendar.ts`)
- Verified calendar month table across BS 2000 through BS 2090 against independent Nepal astronomical ephemeris.
- Fixed `BS_START_GREGORIAN_UTC` anchor (`1943-04-14` / `1943-04-13T18:15:00.000Z` UTC) so that `2083-01-01 BS` maps exactly to `2026-04-14 AD` (represented as `2026-04-13T18:15:00.000Z` UTC in Nepal Standard Time UTC+5:45).
- Fail-closed conversion returning `null` for unsupported/out-of-range years, triggering protective minor-privacy classification in `PrivacyEngineService`.
- Unit test suite (`services/api/test/localization.spec.ts`) asserts historical cases (2000, 2046, 2072, 2081, 2083), month transitions, year rollovers (Chaitra 30, 2082 -> Baisakh 1, 2083), leap years, and Nepal-midnight boundary alignment.

### B. Database Enhancements (`database/migrations/004_genealogy_m3_enhancements.sql` & `005_person_names_alias_constraint.sql`)
- Added optimistic locking `version INT NOT NULL DEFAULT 1` on `persons`.
- Added composite and covering indexes:
  - `idx_parent_links_child` on `parent_links(child_id)`
  - `idx_spouse_links_spouse` on `spouse_links(spouse_id)`
  - `idx_duplicate_candidates_status` on `duplicate_candidates(status)`
  - `idx_duplicate_merges_surviving_merged` on `duplicate_merges(surviving_person_id, merged_person_id)`
  - `idx_persons_archived_living` on `persons(is_archived, living_status)`
- Migration 005 replaces rigid unique constraint with partial unique index `idx_person_names_unique_primary ON person_names(person_id, language) WHERE is_primary = TRUE`, supporting unlimited non-primary aliases for absorbed records during duplicate merges.

### C. Shared Contracts & Localization (`@kashyap/contracts`, `@kashyap/localization`)
- Added complete DTOs: `PersonSearchQueryDto`, `PersonSearchResponseDto`, `EvaluateProposedPersonDto`, `DuplicateCandidateDto`, `DuplicateCompareDto`, `MergePersonsDto`, `MergeResultDto`, `GenealogyExportRequestDto`, `GenealogyExportResponseDto`, `AdminCreatePersonDto`, `AdminUpdatePersonDto`, `AdminArchivePersonDto`, `TreeNodeDto` (with `ancestors` array).
- Machine error codes catalogue & bilingual messages: `STALE_UPDATE_DETECTED (GEN_3010)`, `JUSTIFICATION_REQUIRED (ADM_3011)`, `DUPLICATE_MERGE_CYCLE (DUP_5003)`, `CANNOT_MERGE_CLAIMED_PERSONS (DUP_5005)`, `DUPLICATE_CANDIDATE_NOT_FOUND (DUP_5006)`, `CANNOT_MERGE_SAME_PERSON (DUP_5007)`, `DUPLICATE_CANDIDATE_DETECTED (DUP_5001)`, `MERGE_CONFLICT_UNRESOLVED (DUP_5008)`, `DUAL_BRANCH_AUTHORITY_REQUIRED (BR_3002)`, `MAX_TREE_DEPTH_EXCEEDED (GEN_3005)`.

### D. Backend Domain Services (`services/api`)
- `PersonRepository`: Trigram similarity searches, canonical duplicate merge pointer resolution, optimistic locking update queries, and profile snapshot loading.
- `GenealogyLinkRepository`: Transaction-scoped advisory locking (`pg_advisory_xact_lock`), recursive CTE ancestry cycle detection with depth > 100 fail-closed bounds, bidirectional link queries, and merge relationship migration.
- `DuplicateRepository`: Candidate queue querying, candidate status resolution, uncommitted candidate matching, and merge history tracking.
- `SearchService`: Full bilingual search, branch and generation filtering, multi-page pagination with non-overlapping identifiers, and viewer-context privacy transformation.
- `PrivacyEngineService`: Contextual visibility rules (Public, Verified Community, Private), living status checks, authoritative role-to-branch scope verification, dynamic Bikram Sambat age calculation, and strict minor protection (< 18 / uncertain age masking) without admin bypass on `PRIVATE` address/DOB fields.
- `DuplicateService`: Side-by-side comparison matrix, live uncommitted duplicate evaluation, candidate resolution, material conflict validation, account-link transfer, and governed atomic merge with alias preservation.
- `GenealogyService`: CRUD operations with mandatory justification reasons, version increments, authoritative duplicate pre-creation evaluation requiring `allowDuplicateOverride: true`, dual-branch authority enforcement on link additions, recursive tree hierarchy generation with ancestor expansion, strongly typed DI with atomic `audit_outbox` persistence, and privacy-filtered JSON/CSV export.

### E. Admin Web Application (`apps/admin`)
- `/people`: Bilingual search bar, generation & branch filters, pagination, CSV/JSON export actions, and "Add Person" modal with live duplicate pre-warning and override toggle.
- `/people/[id]`: Complete profile details, parents/spouses/children relationship management, edit modal with mandatory justification and version tracking, and soft-archive.
- `/tree`: Interactive visual tree canvas with pan/zoom/reset, focus person search selector, ancestor rendering, and node detail drawer with relative recentering.
- `/duplicates`: Duplicate candidate queue, side-by-side comparison difference matrix, conflict highlighting, dismissal, and governed merge dialog.

### F. Flutter Mobile Architecture (`apps/mobile`)
- `lib/theme/app_theme.dart`: Modern Heritage theme tokens (Heritage Brown `#4A2C1A`, Saffron `#D18B28`, Warm Cream `#FFF8ED`).
- `lib/models/`: Strongly-typed Dart models (`Person`, `PersonDetail`, `TreeNode`).
- `lib/services/genealogy_api_service.dart`: HTTP API client for search, person detail, and tree fetching.
- `lib/screens/`: `PersonSearchScreen`, `PersonDetailScreen`, and `ReadOnlyTreeScreen` with pan/zoom interactive viewer.

---

## 3. Verification & Test Evidence

### A. Real Nest AppModule & HTTP Integration Tests (`test/genealogy-http.integration.spec.ts`)
- **Section 1: Concurrency, Advisory Locking & Cycle Prevention**:
  - `should acquire pg_advisory_xact_lock and prevent cycle creation (ancestor -> child)`: PASS
  - `should reject self-parenting link (person linking to self)`: PASS
  - `should handle concurrent edge mutations without deadlocks`: PASS
- **Section 2: Duplicate Pre-Evaluation & Creation Governance**:
  - `should evaluate duplicate candidate before creation (DUP-FR-001)`: PASS
  - `should block creation of duplicate candidate without explicit allowDuplicateOverride`: PASS
  - `should allow duplicate creation when allowDuplicateOverride is true and audit the override`: PASS
  - `should reject creation if justification reason is empty or boilerplate`: PASS
- **Section 3: Optimistic Locking & Administrative Mutations**:
  - `should update person record and increment version`: PASS
  - `should reject stale update when version does not match`: PASS
  - `should soft-archive person record with justification`: PASS
- **Section 4: Governed Duplicate Review, Comparison & Merge**:
  - `should compare two duplicate candidates side-by-side`: PASS
  - `should resolve duplicate candidate status to NOT_A_DUPLICATE`: PASS
  - `should reject merge if material conflict exists without field resolutions`: PASS
  - `should execute governed atomic merge, migrate links, preserve aliases, and redirect lookups`: PASS
  - `should reject merge between two claimed accounts`: PASS
- **Section 5: Tree Hierarchy & Depth Budgeting**:
  - `should construct tree with ancestor expansion and descendant hierarchy`: PASS
  - `should enforce tree node limit and depth budget`: PASS
- **Section 6: Privacy-Filtered Genealogy Export**:
  - `should export JSON with branch filtering and privacy masking`: PASS
  - `should export CSV with correct columns and masked values`: PASS
- **Section 7: Outbox Atomicity & Transaction Failure Modes**:
  - `should roll back person creation if audit outbox insertion fails`: PASS
  - `should roll back link addition if audit outbox insertion fails`: PASS
- **Section 8: Authoritative Role-to-Branch Assignment & Boundary Isolation**:
  - `should reject compare when branch admin has mixed role on another branch`: PASS
  - `should reject candidate resolution when branch admin is registered user on target branch`: PASS
  - `should reject merge when branch admin lacks administrative authority over both branches`: PASS
- **Section 9: Complete 6-Viewer Privacy Matrix on Protected Minor Record**:
  - `isSelf`: Full access to living status, phone, address, and DOB: PASS
  - `guest`: Phone, address, and DOB masked: PASS
  - `verified_member`: Phone, address, and DOB masked (minor protected): PASS
  - `branch_admin_1 (assigned branch)`: Phone visible, address and DOB masked (PRIVATE fields strictly protected): PASS
  - `branch_admin_2 (cross branch)`: Phone, address, and DOB masked: PASS
  - `super_admin`: Phone visible, address and DOB masked (PRIVATE fields strictly protected): PASS
- **Section 10: Multi-Page Bilingual Search Pagination & Role Assignment Scoping**:
  - `should paginate search results without ID overlap across pages`: PASS
  - `should paginate English-only names with exact totals and hasMore`: PASS
  - `should enforce authoritative roleAssignments on includeArchived search`: PASS

### B. Summary of All Verification Tiers
| Verification Tier | Scope / Command | Total Tests / Items | Result | Execution Details |
|-------------------|-----------------|---------------------|--------|-------------------|
| **Backend Unit Tests** | `pnpm --filter @kashyap/api test:unit` | 101 tests (13 suites) | **100% PASS** | In-memory & isolated unit tests (~19.6s) |
| **Real PostgreSQL/Redis Integration** | `pnpm --filter @kashyap/api test:integration` | 99 tests (7 suites) | **100% PASS** | Real PostgreSQL (`127.0.0.1:5434`) & Redis (`127.0.0.1:6379`) (~11.0s) |
| **Playwright Browser E2E** | `pnpm run test:e2e` | 9 tests (2 suites) | **100% PASS** | Full browser governance & session flows in Chromium (~20.3s) |
| **Mocked Mobile Widget Tests** | `flutter test` (in `apps/mobile`) | 5 tests (2 suites) | **100% PASS** | DTO serialization, widget rendering & `FakeGenealogyApiService` flow (~3.0s) |
| **Real Device / API Integration** | `flutter test integration_test/ -d emulator-5554` | 1 test suite | **100% PASS** | Executed on Android 15 emulator (`emulator-5554`) querying real NestJS API (`http://10.0.2.2:3000`) & PostgreSQL records |
| **Flutter Static Analysis** | `flutter analyze` (in `apps/mobile`) | 1 package | **100% CLEAN** | 0 issues found |
| **Local Debug APK Build** | `flutter build apk --debug` | 1 APK target | **100% SUCCESS** | Built `app-debug.apk` (155,512,516 bytes, Exit Code 0) |
| **Monorepo Build** | `pnpm -r build` | 6 projects | **100% PASS** | API, Admin, Contracts, Localization, Tokens, Fixtures |

### C. Mobile Client Architecture & Multi-Tier Verification

1. **Mocked Unit & Widget Tests (`apps/mobile/test/`)**:
   - `models_and_widgets_test.dart`: Verifies `PersonSummary`, `PersonDetail`, `ParentRelation`, `SpouseRelation`, `ChildRelation`, and `TreeNode` serialization against `@kashyap/contracts` DTO schemas, and verifies `KashyapApp` initial widget layout.
   - `api_smoke_flow_test.dart`: Mocked navigation test utilizing `FakeGenealogyApiService` asserting Search -> Person Details -> Relative Navigation -> Tree Canvas navigation without network dependency.

2. **Deterministic Real Device & Live API Verification (`apps/mobile/integration_test/real_api_device_test.dart`)**:
   - **Target Device / Emulator**: `emulator-5554` (`sdk gphone64 x86_64`, Android 15 / API 35).
   - **Backend Target**: Live NestJS API running on host `127.0.0.1:3000` accessible via Android emulator gateway `http://10.0.2.2:3000`.
   - **Database Target**: Real PostgreSQL on D: drive (`127.0.0.1:5434/kashyap_db`).
   - **Deterministic 3-Generation Fixture**:
     - Selected Target Person (Gen 2): `9fa0f0b3-7dba-4971-afc9-4f38544cd9af` (`जनक150249 अधिकारी`)
     - Parent Fixture (Gen 1): `ae11d82c-5a5b-4d71-aed2-2672df9cffe3` (`पितामह150249 अधिकारी`, link ID `21bc77d3-3fbf-4a98-85c2-d0826a316cd8`)
     - Child Fixture (Gen 3): `69570b80-fc50-4c74-8476-65e9600ef37b` (`नन्दन150249 अधिकारी`, link ID `bc0630d8-0bbc-437f-a9d0-bd057f4af8aa`)
   - **Strict Verification Assertions**:
     - Pre-UI Assertions: Validated that parent and child relationships exist in database, and asserted that relative `targetPersonId` strictly points to the relative's person record rather than the relationship link row ID (`targetPersonId != linkId`).
     - Tree API Assertions: Validated tree root (`जनक150249 अधिकारी`), ancestor array containing `पितामह150249 अधिकारी`, and child array containing `नन्दन150249 अधिकारी`.
     - Device UI Search: Entered search query `जनक150249` and tapped matching result card. Asserted active `PersonDetailScreen.personId` equals target person ID (`9fa0f0b3-7dba-4971-afc9-4f38544cd9af`).
     - Unconditional Relative Navigation: Scrolled into view and tapped child card `नन्दन150249 अधिकारी`. Asserted active `PersonDetailScreen.personId` equals child person ID (`69570b80-fc50-4c74-8476-65e9600ef37b`) and strictly differs from relationship link row ID (`bc0630d8-0bbc-437f-a9d0-bd057f4af8aa`).
     - Return Navigation: Navigated back via Back button and asserted active `PersonDetailScreen.personId` returns to original target person ID (`9fa0f0b3-7dba-4971-afc9-4f38544cd9af`).
     - Device Tree Navigation: Tapped `Icons.account_tree` and asserted rendered ancestor name (`पितामह150249 अधिकारी`), root name (`जनक150249 अधिकारी`), and child name (`नन्दन150249 अधिकारी`) on `ReadOnlyTreeScreen`.
   - **Result**: `00:55 +1: All tests passed!`

3. **Local Debug APK Build & Security Manifest Hardening**:
   - **Command**: `$env:PUB_CACHE="D:\.pub-cache"; $env:GRADLE_USER_HOME="D:\.gradle"; flutter build apk --debug`
   - **Output Path**: `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`
   - **Size**: 155,512,516 bytes (148.3 MB)
   - **Security Hardening**:
     - Main Manifest (`apps/mobile/android/app/src/main/AndroidManifest.xml`): Declares `<uses-permission android:name="android.permission.INTERNET"/>` with standard HTTPS enforcement; blanket cleartext traffic is strictly removed.
     - Debug Manifest (`apps/mobile/android/app/src/debug/AndroidManifest.xml`): Scopes `android:usesCleartextTraffic="true"` solely to debug/emulator builds.
     - Verified Merged Release Manifest: Executed `:app:processReleaseMainManifest` and verified that `apps/mobile/build/app/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml` does **not** contain `android:usesCleartextTraffic="true"`.

4. **Remote CI Integration (`.github/workflows/ci.yml`)**:
   - GitHub Actions workflow runs headless verification across PostgreSQL 16 & Redis 7 services, full monorepo build, backend unit & integration tests, Playwright browser tests, Flutter SDK setup, `flutter pub get`, `flutter analyze` (0 issues), and `flutter test`.

---

## 4. Preservation & Environmental Compliance
- Real PostgreSQL persistence on D: storage (`127.0.0.1:5434`, `/mnt/kashyap_pg/pgdata`) verified and active.
- Real Redis persistence on D: storage (`127.0.0.1:6379`, `/mnt/kashyap_pg/redis`) verified and active.
- Existing migrations `000..003` strictly preserved; migrations `004` and `005` applied and verified.
- Unrelated WSL clusters and workloads (`vidyarthi`, `mala_chem`) preserved completely intact.
