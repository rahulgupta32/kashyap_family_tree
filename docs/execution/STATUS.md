# Status Report

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Current Phase**: Milestone 3 (Persistent Genealogy Core, Person Search, Interactive Tree Navigation, Governed Duplicate Management, and Mobile Client Architecture) - COMPLETED & FULLY VERIFIED  
**Last Updated**: 2026-09-13T10:45:00+05:45  
**Active Branch**: `feat/m3-genealogy-core`  
**Base Branch**: `develop`  
**Verified M2 Merge PR**: #2  

---

## 1. Multi-Dimensional Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Foundation Readiness** | ✅ **PASSED (M1)** | Monorepo structure, contracts, localization, design tokens, test fixtures, CI/CD with PostgreSQL 16 & Redis 7 containers, and NestJS/Next.js builds verified. |
| **Persistence Readiness** | ✅ **PASSED (M1, M2 & M3)** | Real PostgreSQL 16 persistence on D: drive (`D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`). Real Redis 7 persistence on D: (`/mnt/kashyap_pg/redis`). Automatic in-memory fallbacks strictly rejected outside tests. Durable `audit_outbox` table and database-enforced unique constraint (`003_audit_outbox_unique_event.sql`). Genealogy indexes, optimistic locking versioning, and duplicate candidate queue in `004_genealogy_m3_enhancements.sql`. Unlimited non-primary alias support in `005_person_names_alias_constraint.sql`. |
| **Test Completeness** | ✅ **PASSED (M3)** | 78 unit tests across 12 suites (100% PASS), 82 real PostgreSQL/Redis integration tests across 7 suites including real Nest AppModule HTTP tests (100% PASS), and Playwright end-to-end browser test cases (100% PASS). Total: 160 automated backend tests passed. |
| **Security Readiness** | ✅ **HARDENED** | PostgreSQL transaction advisory graph lock (`pg_advisory_xact_lock`), rule-based privacy engine with dynamic Bikram Sambat age calculation and strict minor (< 18 / uncertain age) masking, optimistic locking versioning (`STALE_UPDATE_DETECTED`), claim conflict protection on merge (`CANNOT_MERGE_CLAIMED_PERSONS`), mandatory justification reason validation, strongly typed DI with atomic audit outbox persistence, and server-authoritative dual-branch resolution. |
| **Operational Readiness** | ✅ **D: STORAGE VERIFIED** | PostgreSQL (`ensure-kashyap-pg.sh`) and Redis (`ensure-kashyap-redis.sh`) verified on D: drive ext4 mount. Unrelated WSL workloads (`vidyarthi`, `mala_chem`) strictly preserved. |
| **UAT Readiness** | ⬜ **NOT STARTED** | Scheduled for Phase G6. |
| **Production Readiness** | ⬜ **NOT READY** | Platform is in active development. |

---

## 2. Completed Milestones ✅

- [x] **Milestone 3: Persistent Genealogy Core, Person Search, Interactive Tree Navigation, Governed Duplicate Management, and Mobile Client Architecture (Fully Completed & Verified)**:
  - Directed Acyclic Graph (DAG) concurrency protection using transaction-scoped PostgreSQL advisory lock `pg_advisory_xact_lock(hashtext('kashyap_lineage_graph'))` preventing cycle formation under concurrent edge mutations.
  - Trigram and phonetic person search across Nepali and English name records with branch, generation, and living status filtering.
  - Interactive Family Tree Canvas in Next.js Admin portal with pan/zoom/center controls, focused root selector, and node detail drawer.
  - Governed duplicate management: pre-creation uncommitted duplicate scoring, candidate review queue, side-by-side comparison matrix, dismissal, and atomic governed merge.
  - Stale update protection using entity versioning (`STALE_UPDATE_DETECTED / GEN_3010`) and mandatory justification reason audit logging (`ADM_3011`).
  - Rule-based privacy engine (`PRIV-FR-001..004, 007..008`) enforcing strict minor protection for individuals under 18 or with uncertain age.
  - Authorized privacy-filtered JSON and CSV export (`POST /genealogy/export`).
  - Flutter mobile architecture in `apps/mobile` with Modern Heritage design tokens, Riverpod service structure, and read-only tree viewing.
  - Full automated verification: 78 unit tests, 67 real PostgreSQL integration tests, and 8 Playwright E2E browser tests (100% PASS).
  - Delivery report published (`docs/execution/MILESTONE_3_DELIVERY_REPORT.md`).

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

## 3. Active Next Work: Awaiting Milestone 4 Authorization 🛑

* **Milestone 4 has NOT been authorized and has NOT been started.**
* Platform remains on `feat/m3-genealogy-core` for user review and PR inspection.
