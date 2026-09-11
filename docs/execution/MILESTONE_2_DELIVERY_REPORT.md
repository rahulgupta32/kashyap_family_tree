# Milestone 2 Delivery & Verification Report: Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions

**Platform**: Kashyap Adhikari Family Tree Platform  
**Managing Entity**: Jyphra Technology Pvt. Ltd.  
**Governing Baseline**: Kashyap Adhikari Final Implementation Documentation Baseline v1.1  
**Repository**: [https://github.com/rahulgupta32/kashyap_family_tree](https://github.com/rahulgupta32/kashyap_family_tree)  
**Branch**: `feat/m2-auth-permissions`  
**Base Branch**: `develop`  
**Verified Commit**: `061b80d`  
**GitHub Actions CI Run**: `34603504261` (Status: `completed`, Conclusion: `success`)  
**Date**: 2026-09-11  

---

## 1. Executive Summary

Milestone 2 delivers production-grade, persistent user accounts, cryptographic OTP authentication, multi-device session management with reuse detection, server-enforced role-based and branch-based access control (RBAC & Branch Governance), and automated browser testing. All synthetic user ID generation, phone-suffix privileges, and in-memory fallbacks have been completely eliminated and replaced with persistent PostgreSQL storage, real Redis challenge storage on **D:** drive ext4 storage, NestJS server guards, and Playwright end-to-end browser automation.

Key accomplishments include:
1. **Secure Token Configuration, Cryptographic Logout & Real-Time Revocation**:
   - Validates signing configuration at startup via `getJwtSecret()`, rejecting missing or weak keys in non-test modes.
   - Enforces `HS256`, issuer `kashyap-platform`, audience `kashyap-api`, 15-minute access token expiry, and explicit `tokenType: 'access'`.
   - Binds access tokens to persistent database sessions via `sid` claim. In `JwtStrategy`, `session.user_id === payload.sub` is strictly validated.
   - Cryptographic Bearer logout verifies signature, algorithm, issuer, audience, token type, expiry, and session ownership through the authentication layer before revoking anything. Refresh-token logout matches database session and revokes ownership.
   - Permissions are strictly derived from live database records via `UserRepository.getUserRoles()`; empty role assignments never fall back to JWT claims.
2. **Authoritative Server-Side Branch & Resource Governance (`GEN-002`)**:
   - Mutating endpoints dynamically resolve the target record's authoritative branch from PostgreSQL; client body/query `branchId` overrides are rejected with `403 BRANCH_MISMATCH`.
   - Parent and spouse genealogy mutations inspect both affected individuals from PostgreSQL and require `SUPER_ADMIN` or dual-branch authority (`GEN-002`).
   - List endpoints (`GET /claims`, `GET /change-requests`) automatically filter returned records by the caller's authorized branch scope.
3. **Browser Credential Isolation & Multi-Tab Web Locks Refresh Coordination**:
   - Refresh tokens are transmitted exclusively via `HttpOnly; SameSite=Strict; Secure; Path=/` cookies on web routes (`/auth/otp/verify`, `/auth/refresh`). Response JSON strictly omits `refreshToken`.
   - Native clients are served by dedicated endpoints (`/auth/native/verify`, `/auth/native/refresh`) delivering tokens in JSON without cookies; browser requests with `Origin` or `Referer` are rejected with `403 FORBIDDEN_BROWSER_ORIGIN`.
   - Strict CORS allowlist and CSRF Origin validation on mutating cookie-authenticated endpoints.
   - Multi-tab token refresh coordination using Web Locks API (`navigator.locks.request`), `BroadcastChannel`, and `localStorage`, ensuring single-use token rotation without race conditions or artificial grace windows.
4. **Concurrency-Safe Atomic OTP & SMS Failure Handling**:
   - Cryptographic 6-digit OTP reservation and verification execute via atomic Redis Lua scripts (`EC-0013`, `EC-0014`), reserving challenge and replacing active sessions atomically.
   - Verification script confirms `active_session === suppliedSessionId` before incrementing attempts or consuming.
   - Downstream SMS delivery failures trigger atomic Redis cleanup of only the failed session challenge while preserving rate-limiting abuse counters with a 5s retry backoff.
   - Refresh token rotation executes inside a PostgreSQL transaction using `SELECT ... FOR UPDATE` row locking. Under `EC-0020`, replaying an invalidated refresh token triggers universal session revocation across all devices.
5. **Mandatory Audit Evidence & Durable Outbox**:
   - PostgreSQL `audit_outbox` table (`database/migrations/002_audit_outbox.sql`) guarantees session revocation persists even if downstream audit writes fail, with persistent entries surviving application restarts.
   - Role assignment (`assignUserRole`) and revocation (`revokeUserRole`) are executed in a PostgreSQL transaction with audit logging; failure of audit logging rolls back the role mutation.
6. **Transparent Architectural Status**:
   - `ClaimsService` currently operates on an in-memory `Map<string, ClaimRecord>` and is not persisted to PostgreSQL (scheduled for future claim verification milestones).
7. **SMS Provider & Bootstrap Hardening**:
   - `TestSmsProviderAdapter` is strictly excluded from production environments via factory providers and constructor guards.
   - `SparrowSmsProviderAdapter` validates `SPARROW_SMS_TOKEN` on module initialization (`OnModuleInit`) and enforces HTTPS (`https://api.sparrowsms.com/v2/sms/`).
   - Fictional administrator seeding is gated behind `SEED_ADMINS=true` (disabled by default) and throws a fatal security exception if attempted in production mode.
8. **D: Drive Storage & Verification**:
   - Storage verification script [`scripts/ensure-kashyap-redis.sh`](../scripts/ensure-kashyap-redis.sh) validates Redis working directory `/mnt/kashyap_pg/redis` inside the D: loop mount (`D:\Jyphra\pg_data\kashyap_pg.img`).

---

## 2. Requirement & Edge-Case Traceability Matrix

| Requirement / Rule ID | Baseline Spec Section | Description | Implementation Artifact | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-FR-001** | Section 4.1 | Nepali Mobile Number Registration (+977 98/97XXXXXXXX, E.164 normalization) | `services/api/src/common/utils/phone.util.ts` | `test/phone.util.spec.ts` | **VERIFIED** |
| **AUTH-FR-002** | Section 4.1 | OTP Challenge Generation (Cryptographic random, SHA-256 salt/hash in Redis, 300s expiry) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts`, `test/auth.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-003** | Section 4.1 | OTP Verification & Atomic Single-Use Consumption (Redis Lua script, single winner) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-004** | Section 4.1 | Anti-Abuse Rate Limiting (60s cooldown, 5 attempts max, resend invalidation) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts`, `test/auth.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-005** | Section 4.2 | Multi-Device Session Management (PG `user_sessions`, device tracking) | `services/api/src/database/repositories/session.repository.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-006** | Section 4.2 | Refresh Token Rotation (`SELECT ... FOR UPDATE` row locking, new session generation) | `services/api/src/modules/auth/auth.service.ts` | `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-007** | Section 4.2 | Explicit Logout & Session Invalidation (Instant server-side revocation) | `services/api/src/modules/auth/auth.service.ts` | `test/auth-flow.integration.spec.ts`, `e2e/login-flow.spec.ts` | **VERIFIED** |
| **AUTH-FR-008** | Section 4.3 | Role-Based Access Control (Super Admin, Branch Admin, Branch Verifier, Member) | `services/api/src/modules/auth/guards/roles.guard.ts` | `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-009** | Section 4.3 | Branch Authority Scope & Resource Resolution (Branch isolation on mutations) | `services/api/src/modules/auth/guards/branch.guard.ts` | `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-010** | Section 4.3 | Instant Suspension Enforcement (Session invalidated, access blocked in real time) | `services/api/src/database/repositories/user.repository.ts` | `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-011** | Section 4.1 | Pluggable SMS Provider Adapter Interface | `services/api/src/modules/auth/sms/sms-provider.interface.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **AUTH-FR-012 / HG-007** | Section 4.1 | Honest Gateway Gate (Production Sparrow SMS API credentials check on startup) | `services/api/src/modules/auth/sms/sparrow-sms-provider.adapter.ts` | `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **BR-GOV-001** | Section 6.1 | Identity / Person Separation (Account creation NEVER creates person record) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **BR-GOV-004** | Section 6.1 | Self-Elevation Prohibited (Admins cannot elevate themselves or grant unauthorized roles) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts`, `test/auth.integration.spec.ts` | **VERIFIED** |
| **BR-GOV-005** | Section 6.1 | Branch Authority Limitation (Branch admins cannot verify outside assigned branch) | `services/api/src/modules/auth/guards/branch.guard.ts` | `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **BR-GOV-008** | Section 6.1 | Tamper-Evident Audit Logging (SHA-256 chain, immutable trigger) | `services/api/src/database/repositories/audit.repository.ts` | `test/audit.service.spec.ts`, `test/database.integration.spec.ts` | **VERIFIED** |
| **EC-0011** | Section 11 | Expired OTP Challenge Rejection (`AUTH_1002`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **EC-0012** | Section 11 | Exceeded OTP Verification Attempts Lockout (`AUTH_1003`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **EC-0013** | Section 11 | Atomic Single-Use OTP Consumption via Lua Script | `services/api/src/modules/auth/auth.service.ts` | `test/auth-security-regressions.integration.spec.ts` | **VERIFIED** |
| **EC-0014** | Section 11 | Resend Cooldown Enforcement (`AUTH_1004`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **EC-0020** | Section 11 | Refresh Token Reuse Detection & Universal Revocation (`AUTH_1011`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **EC-0023** | Section 11 | Unclaimed Account Registration (`person_id = NULL`) | `services/api/src/database/repositories/user.repository.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **EC-0225** | Section 11 | Rate Limit Exceeded on OTP Request (`SYS_9003`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **EC-0230** | Section 11 | Self-Elevation Attempt Rejection (`AUTH_1013`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |

---

## 3. Storage Architecture: D: Drive Persistence

Both database engines adhere strictly to the enterprise D: drive storage boundary:
1. **PostgreSQL 16**:
   - Cluster Name: `kashyap` on port `5433` (bridged to `127.0.0.1:5434` for Windows host development).
   - Data Directory: `/mnt/kashyap_pg/pgdata` backed by `D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`.
   - Logging: `/mnt/kashyap_pg/logs/postgresql-16-kashyap.log`.
2. **Redis 7**:
   - Port: `6379` (bound to `0.0.0.0` inside WSL).
   - Persistence Directory: `/mnt/kashyap_pg/redis` (`dump.rdb` and `appendonly.aof`).
   - Verification Script: [`scripts/ensure-kashyap-redis.sh`](../scripts/ensure-kashyap-redis.sh) enforces exact canonical D: backing mount and runtime `dir` configuration.

---

## 4. Administrative Portal & Playwright Browser Automation (`apps/admin`, `e2e`)

The Next.js administration portal and automated browser testing cover:
- **API Client** (`apps/admin/src/lib/api-client.ts`): Fully typed wrapper with `credentials: 'include'` on all endpoints.
- **Authentication Context** (`apps/admin/src/context/auth-context.tsx`):
  - Refresh tokens handled strictly via `HttpOnly; SameSite=Strict` cookies (never stored in `localStorage`).
  - In-flight refresh promise coordination to prevent race conditions during token rotation.
  - Automatic session restoration on app load from the server cookie.
- **Bilingual Login Page** (`apps/admin/src/app/login/page.tsx`):
  - Form validation for Nepali mobile numbers (`98XXXXXXXX` / `97XXXXXXXX`).
  - Cooldown timer countdown showing remaining seconds before allowing resend.
  - 6-digit OTP entry with automated numeric sanitization.
  - Clear bilingual Access Denied screen for verified users lacking administrative roles.
- **Playwright End-to-End Test Suite** (`e2e/login-flow.spec.ts`):
  1. Regular user gets bilingual Access Denied state (BR-GOV-004).
  2. Super Admin login, dashboard redirection, cookie verification (`HttpOnly; SameSite=Strict`), absence of refresh tokens in `localStorage`, session restoration across page reload, and logout with server-side revocation.
  - Automated execution integrated into GitHub Actions CI (`.github/workflows/ci.yml`).

---

## 5. Automated Verification Results

| Test Suite | File | Tests | Result | Execution Time |
| :--- | :--- | :---: | :---: | :---: |
| **Auth Unit Tests** | `services/api/test/auth.service.spec.ts` | 13 | **PASS** | ~14.6s |
| **Phone Util Unit Tests** | `services/api/test/phone.util.spec.ts` | 5 | **PASS** | ~1.2s |
| **Localization Tests** | `services/api/test/localization.spec.ts` | 12 | **PASS** | ~7.1s |
| **Nest Graph Startup** | `services/api/test/nest-startup.spec.ts` | 2 | **PASS** | ~13.8s |
| **Core Services Unit Tests** | `services/api/test/*.spec.ts` (12 suites total) | 78 | **PASS** | ~16.1s |
| **Real PG Integration** | `services/api/test/database.integration.spec.ts` | 12 | **PASS** | ~6.9s |
| **Real PG/Redis Auth Integration** | `services/api/test/auth.integration.spec.ts` | 6 | **PASS** | ~7.3s |
| **Auth Security Regressions** | `services/api/test/auth-security-regressions.integration.spec.ts` | 12 | **PASS** | ~10.2s |
| **E2E HTTP Auth & Permissions Flow** | `services/api/test/auth-flow.integration.spec.ts` | 8 | **PASS** | ~11.1s |
| **M2 Security & Authority Hardening** | `services/api/test/auth-m2-hardening.integration.spec.ts` | 17 | **PASS** | ~5.7s |
| **Integration Test Total** | `pnpm --filter @kashyap/api run test:integration` (5 suites total) | 55 | **PASS** | ~8.5s |
| **Playwright Browser E2E Tests** | `e2e/login-flow.spec.ts` (`pnpm run test:e2e`) | 3 | **PASS** | ~6.9s |
| **Next.js Admin Build** | `apps/admin` (`pnpm run build`) | N/A | **PASS** | ~8.4s |
| **Workspace Typecheck** | `pnpm run typecheck` | N/A | **PASS** | ~4.5s |

---

## 6. Honest Documentation Gate: HG-007 (Sparrow SMS Activation)

In accordance with requirement **AUTH-FR-012** and gate **HG-007**, synthetic OTP bypass is strictly blocked in production (`NODE_ENV === 'production'`).

To activate live SMS delivery via Sparrow SMS in production:
1. Obtain enterprise credentials from Sparrow SMS (Nepal).
2. Set the following environment variables in production:
   - `SPARROW_SMS_TOKEN`: Enterprise API authorization token.
   - `SPARROW_SMS_FROM`: Approved Sender ID / Identity (e.g., `KashyapOrg`).
   - `SPARROW_SMS_API_URL`: (Defaults to HTTPS `https://api.sparrowsms.com/v2/sms/`).
3. If credentials are unset in production, `SparrowSmsProviderAdapter` throws a fatal configuration error during startup, preventing unauthenticated deployment.
