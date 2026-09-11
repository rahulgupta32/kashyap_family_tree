# Status Report

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Current Phase**: Milestone 2 (Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions) - COMPLETED & FULLY VERIFIED  
**Last Updated**: 2026-09-11T17:35:00+05:45  
**Active Branch**: `feat/m2-auth-permissions`  
**Base Branch**: `develop`  
**Verified M2 Commit**: `6d8b1db`  
**GitHub Actions CI Run**: `34595724771` (Status: `completed`, Conclusion: `success`)  
**Verified M1 Merge Commit**: `7c56094`

---

## 1. Multi-Dimensional Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Foundation Readiness** | ✅ **PASSED (M1)** | Monorepo structure, contracts, localization, design tokens, test fixtures, CI/CD with PostgreSQL 16 & Redis 7 containers, and NestJS/Next.js builds verified. |
| **Persistence Readiness** | ✅ **PASSED (M1 & M2)** | Real PostgreSQL 16 persistence on D: drive (`D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`). Real Redis 7 persistence on D: (`/mnt/kashyap_pg/redis`). Automatic in-memory fallbacks strictly rejected outside tests. |
| **Test Completeness** | ✅ **PASSED (M2)** | 78 unit tests across 12 suites, 38 real PostgreSQL/Redis integration tests across 4 suites, and 2 Playwright end-to-end browser tests (100% PASS). |
| **Security Readiness** | ✅ **HARDENED** | HS256 tokens bound to database sessions, real-time revocation on logout/suspension, transactional refresh rotation (`SELECT ... FOR UPDATE`), atomic Lua OTP verification, production gate HG-007 for Sparrow SMS, and bootstrap admin seeding disabled by default. |
| **Operational Readiness** | ✅ **D: STORAGE VERIFIED** | PostgreSQL (`ensure-kashyap-pg.sh`) and Redis (`ensure-kashyap-redis.sh`) verified on D: drive ext4 mount. Unrelated WSL workloads (`vidyarthi`, `mala_chem`) strictly preserved. |
| **UAT Readiness** | ⬜ **NOT STARTED** | Scheduled for Phase G6. |
| **Production Readiness** | ⬜ **NOT READY** | Platform is in active development. |

---

## 2. Completed Milestones ✅

- [x] **Milestone 2: Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions (Fully Corrected & Verified)**:
  - Replaced synthetic user IDs and phone-suffix privileges with PostgreSQL-backed accounts (`user_accounts`, `user_roles`, `user_sessions`, `branches`).
  - Identity / Person separation: account creation strictly leaves `person_id = NULL` (`BR-GOV-001`, `EC-0023`).
  - Secure token configuration: enforced `HS256`, issuer `kashyap-platform`, audience `kashyap-api`, 15m access expiry, and persistent session `sid` binding with real-time database validation and revocation on logout/suspension.
  - Permissions strictly derived from live database records without fallback to JWT claims.
  - Role-branch pairing and server-side resource branch resolution from PostgreSQL for Claims, Change Requests, and Genealogy mutations, rejecting missing or spoofed branch IDs.
  - Concurrency-safe OTP verification with atomic Redis Lua script single-winner consumption (`EC-0013`), resend invalidation, 60s cooldown (`EC-0014`), and 503 fail-fast on Redis offline.
  - Transactional refresh rotation with `SELECT ... FOR UPDATE` row locking and `EC-0020` universal session revocation on replay.
  - SMS & bootstrap hardening: `TestSmsProviderAdapter` excluded from production; `SparrowSmsProviderAdapter` validates credentials at startup and enforces HTTPS; fictional admin seeding gated behind `SEED_ADMINS=true` and fatal in production.
  - Complete browser session flow: `HttpOnly; SameSite=Strict` cookies for refresh tokens (no refresh tokens in `localStorage`), in-flight refresh promise coordination, automatic session restoration, and bilingual Access Denied screen.
  - Automated browser test with Playwright (`e2e/login-flow.spec.ts`) verifying full session lifecycle in CI.
  - Storage verification script (`scripts/ensure-kashyap-redis.sh`) and documentation (`docs/storage-setup.md`).
  - Delivery and verification report published (`docs/execution/MILESTONE_2_DELIVERY_REPORT.md`).
- [x] **Milestone 1: Local Application Foundation with Real PostgreSQL Persistence**:
  - D: Drive storage backing verified (`D:\Jyphra\pg_data\kashyap_pg.img` mounted to `/mnt/kashyap_pg` via `/dev/loop0`).
  - Automated reproducible script (`scripts/ensure-kashyap-pg.sh`) and systemd unit (`scripts/kashyap-pg.service`).
  - Fail-fast bridge (`scripts/pg_bridge.js`) checking backing storage, WSL IP, and port readiness before accepting connections on `127.0.0.1:5434`.
  - Database schema migrations runner with PostgreSQL advisory locks.
  - NestJS dependency injection hardened (`GENEALOGY_TEST_FIXTURE_MODE` token configured).
  - Test fixture mode strictly isolated and forbidden in development and production.
  - Nest DI regression test (`test/nest-startup.spec.ts`) verifying full `AppModule` compilation.
  - Live endpoints verified against compiled API: `/health`, `/health/ready`, `/genealogy/branches`, `/genealogy/people/...`.
  - GitHub Actions CI pipeline configured with `postgres:16-alpine` service container and integration test execution.
  - Delivery and verification report published (`docs/execution/MILESTONE_1_DELIVERY_REPORT.md`).
- [x] Baseline archive verified (all 12 SHA256 checksums PASS) and indexed in `BASELINE_INDEX.md`.
- [x] Architecture Decision Records (ADR-001 through ADR-012) fully documented with 8-dimensional rigor.
- [x] Shared packages created, exported, and typechecked (`@kashyap/contracts`, `@kashyap/localization`, `@kashyap/design-tokens`, `@kashyap/test-fixtures`).
- [x] Next.js Admin Portal (`apps/admin/`) static build verified.

---

## 3. Active Next Work: Awaiting Milestone 3 Authorization 🛑

* **Milestone 3 has NOT been authorized and has NOT been started.**
* Cultural rule execution and real data migration remain strictly untouched until human authorization and PR review.
