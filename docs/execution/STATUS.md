# Status Report

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Current Phase**: Milestone 4 (Governed Workflows, Profile Claims, Kinship Observances & Self-Service) - REMEDIATION COMPLETED & FULLY VERIFIED  
**Last Updated**: 2026-09-17T18:00:00+05:45  
**Active Branch**: `feat/m4-governed-workflows`  
**Target Branch**: `develop`  
**Verified M2 Merge PR**: #2  
**Open M4 Pull Request**: PR #4  

---

## 1. Multi-Dimensional Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Foundation Readiness** | ✅ **PASSED (M1)** | Monorepo structure, contracts, localization, design tokens, test fixtures, CI/CD with PostgreSQL 16 & Redis 7 containers, and NestJS/Next.js builds verified. |
| **Persistence Readiness** | ✅ **PASSED (M1, M2, M3 & M4)** | Real PostgreSQL 16 persistence on D: drive (`D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`). Real Redis 7 persistence on D: (`/mnt/kashyap_pg/redis`). Ephemeral disposable database harness (`test/helpers/disposable-db.ts`) with empty DB migration concurrency verification (`skipMigrations: true`). |
| **Test Completeness** | ✅ **PASSED (M4 REMEDIATED)** | 107 NestJS unit tests across 14 suites (100% PASS), 144 real PostgreSQL integration tests across 14 suites (100% PASS), 13 Playwright end-to-end browser test cases (100% PASS), and 8 Flutter mobile widget tests (100% PASS). Total: 272 automated tests passed across all tiers. |
| **Security Readiness** | ✅ **HARDENED** | PostgreSQL transaction advisory lock (`pg_advisory_xact_lock`), PostgreSQL advisory migration lock (`pg_advisory_lock`), RESTRICTIVE privacy defaults (`VERIFIED_COMMUNITY` creation default, strict SQL visibility predicates across search, tree, detail, relatives, and export), outer-transaction failed OTP attempt counter persistence, signed URL caller validation, resubmission evidence ownership & malware validation, dual-branch authority enforcement on `ADD_SPOUSE`, non-simulated notification gateway status verification, strict `UNAVAILABLE` cultural rules responses without fallback schedules, and fail-closed malware scanner. |
| **Operational Readiness** | ✅ **D: STORAGE VERIFIED** | PostgreSQL (`ensure-kashyap-pg.sh`) and Redis (`ensure-kashyap-redis.sh`) verified on D: drive ext4 mount. Unrelated WSL workloads (`vidyarthi`, `mala_chem`) strictly preserved. Flutter SDK installed on D: (`D:\flutter`), `flutter analyze` clean (0 issues), `flutter test` (8/8 PASS), and `flutter build apk --debug` verified with APK generated on D: storage (`apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`). |
| **UAT Readiness** | ⬜ **NOT STARTED** | Scheduled for Phase G6. |
| **Production Readiness** | ⬜ **NOT READY** | Platform is in active development. PR #4 kept open for user review. |

---

## 2. Completed Milestones ✅

- [x] **Milestone 4: Governed Workflows, Profile Claims, Kinship Observances & Self-Service (Remediated & Verified)**:
  - Concurrent migration initializer regression starting with a verified empty database (`to_regclass('schema_migrations') IS NULL`), 10 parallel initializers under PostgreSQL advisory lock `pg_advisory_lock(742931481)`, asserting exact migration versions (`000` through `009`) with `cnt = 1`.
  - Profile privacy defaults restored to `VERIFIED_COMMUNITY` for new person records, with SQL-level visibility predicate enforcement on person search, details, relatives, tree canvas, and JSON/CSV export.
  - Failed deletion-OTP attempt counter persisted outside transaction boundary so failed attempts increment correctly while preserving single-use atomic consumption on success.
  - Media downloads require authenticated user ID matching signed URL query parameter (`u`), and claim resubmissions validate evidence attachment ownership and clean malware scan status.
  - Dual-branch authorization enforced on `ADD_SPOUSE` change requests linking an existing spouse from a separate branch.
  - Notification dispatcher verifies real gateway configuration or explicit `ALLOW_SIMULATED_NOTIFICATIONS` flag, marking unconfigured dispatches as `FAILED`.
  - Cultural rules calculations return machine-readable `UNAVAILABLE` when rulesets or ephemeris mappings are unapproved/missing, eliminating hardcoded fallback schedules (13/3/1 days) and Tithi defaults.
  - Mobile drawer passes active/searched person ID dynamically to tree, claims, and change request screens (eliminating hardcoded `p-101`), and E2E Playwright tests verify persisted profile address updates.
  - Malware scanning suite includes ClamAV mock TCP daemon unit tests and fail-closed 503 handling, while reporting real virus scanner operational requirements separately.
  - Full automated verification across NestJS unit (107/107), PostgreSQL integration (144/144), Playwright E2E (13/13), Flutter widget tests (8/8), and Flutter debug APK build.

- [x] **Milestone 3: Persistent Genealogy Core, Person Search, Interactive Tree Navigation, Governed Duplicate Management, and Mobile Client Architecture (Fully Completed & Verified)**:
  - Directed Acyclic Graph (DAG) concurrency protection using transaction-scoped PostgreSQL advisory lock `pg_advisory_xact_lock(hashtext('kashyap_lineage_graph'))` preventing cycle formation under concurrent edge mutations.
  - Trigram and phonetic person search across Nepali and English name records with branch, generation, and living status filtering, backed by SQL-level visibility predicate synchronization ensuring deterministic pagination and exact totals.
  - Interactive Family Tree Canvas in Next.js Admin portal with pan/zoom/center controls, focused root selector, ancestor rendering, 500-node budget enforcement, and node detail drawer.
  - Governed duplicate management: pre-creation uncommitted duplicate scoring, candidate review queue, side-by-side comparison matrix, dismissal, authorized duplicate creation override (`allowDuplicateOverride: true`), and atomic governed merge with transaction-scoped duplicate verification and `user_accounts` ownership validation.
  - Stale update protection using entity versioning (`STALE_UPDATE_DETECTED / GEN_3010`) and mandatory justification reason audit logging (`ADM_3011`).
  - Rule-based privacy engine (`PRIV-FR-001..004, 007..008`) with validated BS calendar conversion (`packages/localization/src/calendar.ts`, BS 2000..2090) enforcing strict minor protection for individuals under 18 or with uncertain age (including null-safe current BS date handling), while preventing unconditional admin bypass of field-level PRIVATE disclosure.
  - Authorized privacy-filtered JSON and CSV export (`POST /genealogy/export`) with strict masking on minor and private fields.
  - Flutter mobile architecture in `apps/mobile` with Modern Heritage design tokens, Provider service architecture, and read-only tree viewing.

- [x] **Milestone 2: Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions**:
  - Replaced synthetic user IDs with PostgreSQL-backed accounts (`user_accounts`, `user_roles`, `user_sessions`, `branches`).
  - Cryptographic HS256 tokens bound to database sessions, real-time revocation, and transactional refresh rotation.
  - Atomic revocation with durable audit outbox insertion.
  - Real two-tab concurrent refresh & cross-tab logout via Web Locks API.
  - Strict refresh-token replay detection (EC-0020).

- [x] **Milestone 1: Local Application Foundation with Real PostgreSQL Persistence**:
  - D: Drive storage backing verified (`D:\Jyphra\pg_data\kashyap_pg.img` mounted to `/mnt/kashyap_pg` via `/dev/loop0`).
  - Schema migrations runner with PostgreSQL advisory locks.
  - Fail-fast bridge (`scripts/pg_bridge.js`).
  - Base monorepo contracts, localization, and design tokens.

---

## 3. Active Status 🛑

* **Milestone 4 Remediation Work is Complete.**
* **PR #4 remains open against `develop` at commit `a0a27edb20f49f27f1cac5fdf252439ff288012b` (and updated head commit). PR #4 will NOT be merged and Milestone 5 will NOT be started without explicit user authorization.**
 and PR inspection.
