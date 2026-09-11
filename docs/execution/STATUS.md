# Status Report

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Current Phase**: Milestone 2 (Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions) - COMPLETED & FULLY VERIFIED  
**Last Updated**: 2026-09-11T18:18:00+05:45  
**Active Branch**: `feat/m2-auth-permissions`  
**Base Branch**: `develop`  
**Verified M2 Commit**: `061b80d`  
**GitHub Actions CI Run**: `34603504261` (Status: `completed`, Conclusion: `success`)  
**Verified M1 Merge Commit**: `7c56094`

---

## 1. Multi-Dimensional Readiness Assessment

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Foundation Readiness** | ✅ **PASSED (M1)** | Monorepo structure, contracts, localization, design tokens, test fixtures, CI/CD with PostgreSQL 16 & Redis 7 containers, and NestJS/Next.js builds verified. |
| **Persistence Readiness** | ✅ **PASSED (M1 & M2)** | Real PostgreSQL 16 persistence on D: drive (`D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`). Real Redis 7 persistence on D: (`/mnt/kashyap_pg/redis`). Automatic in-memory fallbacks strictly rejected outside tests. Durable `audit_outbox` table ensures audit evidence survives transient failures. Note: `ClaimsService` operates on an in-memory Map pending future milestone persistence. |
| **Test Completeness** | ✅ **PASSED (M2)** | 78 unit tests across 12 suites, 55 real PostgreSQL/Redis integration tests across 5 suites (including `auth-m2-hardening.integration.spec.ts`), and 3 Playwright end-to-end browser test cases (100% PASS). |
| **Security Readiness** | ✅ **HARDENED** | HS256 tokens bound to database sessions, real-time revocation on logout/suspension, transactional refresh rotation (`SELECT ... FOR UPDATE`), atomic Lua OTP verification and challenge reservation, server-authoritative branch resolution (`GEN-002`), browser credential isolation (HttpOnly cookies, native transport separation with origin blocking), cross-tab Web Locks refresh coordination, production gate HG-007 for Sparrow SMS, and bootstrap admin seeding disabled by default. |
| **Operational Readiness** | ✅ **D: STORAGE VERIFIED** | PostgreSQL (`ensure-kashyap-pg.sh`) and Redis (`ensure-kashyap-redis.sh`) verified on D: drive ext4 mount. Unrelated WSL workloads (`vidyarthi`, `mala_chem`) strictly preserved. |
| **UAT Readiness** | ⬜ **NOT STARTED** | Scheduled for Phase G6. |
| **Production Readiness** | ⬜ **NOT READY** | Platform is in active development. |

---

## 2. Completed Milestones ✅

- [x] **Milestone 2: Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions (Fully Corrected & Verified)**:
  - Replaced synthetic user IDs and phone-suffix privileges with PostgreSQL-backed accounts (`user_accounts`, `user_roles`, `user_sessions`, `branches`).
  - Identity / Person separation: account creation strictly leaves `person_id = NULL` (`BR-GOV-001`, `EC-0023`).
  - Cryptographic token configuration: enforced `HS256`, issuer `kashyap-platform`, audience `kashyap-api`, 15m access expiry, explicit `tokenType: 'access'`, and persistent session `sid` binding with real-time database validation and revocation on logout/suspension. In `JwtStrategy`, `session.user_id === payload.sub` is strictly required.
  - Cryptographic logout & credential conflict handling: Bearer logout verifies signature, algorithm, issuer, audience, token type, expiry, and session ownership via the authentication layer. When an invalid refresh token accompanies a verified Bearer session, the verified session is revoked in the database and access token rejected. Cross-user credential conflicts are explicitly rejected with 401; same-user multi-device credentials revoke both sessions.
  - Atomic revocation with durable audit outbox: `logout` and `logoutAll` execute session revocation and `audit_outbox` recording in the same PostgreSQL transaction, guaranteeing rollback on outbox insertion failure. Post-commit delivery failures preserve committed revocation, while retry/restart deduplication prevents duplicate audit logs in `audit_logs`.
  - Server-side branch authorization: for existing records, authoritative branch is always resolved from PostgreSQL; client body/query `branchId` overrides are rejected (`403 BRANCH_MISMATCH`). Parent and spouse mutations check both people for dual-branch authority or `SUPER_ADMIN` per `GEN-002`.
  - Browser credential isolation: refresh tokens are delivered via `HttpOnly; SameSite=Strict; Secure; Path=/` cookies and strictly omitted from browser JSON responses. Native token transport is separated into `/auth/native/verify` and `/auth/native/refresh` without cookies, rejecting browser `Origin` or `Referer` with `403 FORBIDDEN_BROWSER_ORIGIN`. Strict CORS allowlist and CSRF Origin checks are enforced.
  - Real two-tab concurrent refresh & cross-tab logout: browser tabs coordinate token rotation via Web Locks API (`navigator.locks.request`), allowing strictly one network refresh while waiting tabs acquire the lock and reuse the freshly rotated token without race conditions or reuse grace windows. Cross-tab logout automatically redirects other tabs to `/login` without requiring manual reloads.
  - Concurrency-safe atomic OTP: atomic 5-key Redis Lua script reserves challenge and replaces active sessions (`EC-0013`, `EC-0014`). Verification script checks `active_session === suppliedSessionId` before incrementing attempts or consuming. Failed SMS delivery triggers atomic session cleanup while preserving abuse counters with a 5s retry backoff.
  - Mandatory audit evidence & durable outbox: PostgreSQL `audit_outbox` table guarantees session revocation persists even if downstream audit writes fail. Role assignment and revocation execute transactionally with audit logging, rolling back if audit logging fails.
  - Pluggable SMS provider: `TestSmsProviderAdapter` excluded from production; `SparrowSmsProviderAdapter` validates credentials at startup and enforces HTTPS; fictional admin seeding gated behind `SEED_ADMINS=true` and fatal in production.
  - Honesty note: `ClaimsService` uses an in-memory `Map<string, ClaimRecord>` and is not yet persisted to PostgreSQL (scheduled for future claim verification milestones).
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

