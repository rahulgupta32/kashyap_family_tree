# Milestone 2 Delivery & Verification Report: Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions

**Platform**: Kashyap Adhikari Family Tree Platform  
**Managing Entity**: Jyphra Technology Pvt. Ltd.  
**Governing Baseline**: Kashyap Adhikari Final Implementation Documentation Baseline v1.1  
**Repository**: [https://github.com/rahulgupta32/kashyap_family_tree](https://github.com/rahulgupta32/kashyap_family_tree)  
**Branch**: `feat/m2-auth-permissions`  
**Base Branch**: `develop`  
**Date**: 2026-09-11  

---

## 1. Executive Summary

Milestone 2 delivers production-grade, persistent user accounts, cryptographic OTP authentication, multi-device session management with reuse detection, and server-enforced role-based access control (RBAC). All synthetic user ID generation and phone-suffix privileges have been completely eliminated and replaced with persistent PostgreSQL storage, real Redis challenge storage on **D:** drive ext4 storage, and NestJS server guards.

Key accomplishments include:
1. **PostgreSQL Persistence & Identity Separation**: User accounts (`user_accounts`), roles (`user_roles`), sessions (`user_sessions`), and branches (`branches`) persist in the real PostgreSQL cluster on D: drive storage. In accordance with `BR-GOV-001` and `EC-0023`, account creation strictly leaves `person_id` as `NULL`; registration never fabricates or auto-claims a person in the family tree.
2. **Cryptographic OTP & Redis Persistence on D: Drive**: Implemented cryptographic 6-digit OTP generation with SHA-256 salting, 300-second TTL, 60-second resend cooldown (`EC-0014`), and a 5-attempt lockout threshold (`EC-0012`). Redis 7 was configured with systemd drop-in sandboxing to store its RDB snapshots and logs strictly on the D: drive mount (`/mnt/kashyap_pg/redis/`). Challenges are atomically consumed upon successful verification (`EC-0013`).
3. **Multi-Device Session Management & Replay Detection**: Sessions persist in PostgreSQL with SHA-256 hashed refresh tokens and metadata (device platform, app version, IP, user agent). Implemented refresh token rotation (`AUTH-FR-006`). In accordance with `EC-0020`, any attempt to replay a previously revoked refresh token triggers instant security escalation, immediately revoking all active sessions for that user across all devices.
4. **Server-Enforced Access Control & Governance Guards**: Replaced client-side trust with NestJS guards (`JwtAuthGuard`, `RolesGuard`, `BranchGuard`). Prohibited self-elevation (`BR-GOV-004`, `EC-0230`), and enforced branch-level authorization boundaries (`BR-GOV-005`). Protected all sensitive administrative and genealogy mutation endpoints (`/audit`, `/claims`, `/change-requests`, `/genealogy`).
5. **SMS Provider Adapter & Production Gate HG-007**: Designed the pluggable `SmsProvider` interface. In development and test environments, `TestSmsProviderAdapter` captures OTPs in-memory and simulates delivery. In production, `SparrowSmsProviderAdapter` enforces gate `HG-007`, requiring valid Sparrow SMS API credentials (`SPARROW_SMS_TOKEN`, `SPARROW_SMS_FROM`) and refusing synthetic fallbacks.
6. **Bilingual Admin Application Flow**: Implemented a responsive, accessible Next.js admin login UI (`apps/admin/src/app/login/page.tsx`) with 60-second cooldown timer, bilingual Nepali/English instructions, automatic session restoration, dynamic header displaying role/phone, and a clear "Access Denied / Pending Approval" screen for non-admin accounts.
7. **CI/CD Service Integration**: Updated `.github/workflows/ci.yml` with native `redis:7-alpine` and `postgres:16-alpine` service containers, verifying strict frozen lockfile installation, package builds, typecheck, unit tests, and real PostgreSQL/Redis integration tests.

---

## 2. Requirement & Edge-Case Traceability Matrix

| Requirement / Rule ID | Baseline Spec Section | Description | Implementation Artifact | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-FR-001** | Section 4.1 | Nepali Mobile Number Registration (+977 98/97XXXXXXXX, E.164 normalization) | `services/api/src/common/utils/phone.util.ts` | `test/phone.util.spec.ts` | **VERIFIED** |
| **AUTH-FR-002** | Section 4.1 | OTP Challenge Generation (Cryptographic random, SHA-256 salt/hash in Redis, 300s expiry) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts`, `test/auth.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-003** | Section 4.1 | OTP Verification & Account Activation (Atomic consumption, phone verification flag) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-004** | Section 4.1 | Anti-Abuse Rate Limiting (60s cooldown, 15 req/10m IP threshold, 5 attempts max) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **AUTH-FR-005** | Section 4.2 | Multi-Device Session Management (PG `user_sessions`, device tracking) | `services/api/src/database/repositories/session.repository.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-006** | Section 4.2 | Refresh Token Rotation (One-time use tokens, hash verification, prior revocation) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-007** | Section 4.2 | Explicit Logout & Session Invalidation (Single-device and all-device revocation) | `services/api/src/modules/auth/auth.service.ts` | `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-008** | Section 4.3 | Role-Based Access Control (Super Admin, Branch Admin, Branch Verifier, Member) | `services/api/src/modules/auth/guards/roles.guard.ts` | `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-009** | Section 4.3 | Branch Authority Scope (Branch isolation on mutations) | `services/api/src/modules/auth/guards/branch.guard.ts` | `services/api/src/modules/claims/claims.controller.ts` | **VERIFIED** |
| **AUTH-FR-010** | Section 4.3 | Instant Suspension Enforcement (Blocks refresh and active token verification) | `services/api/src/database/repositories/user.repository.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **AUTH-FR-011** | Section 4.1 | Pluggable SMS Provider Adapter Interface | `services/api/src/modules/auth/sms/sms-provider.interface.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **AUTH-FR-012 / HG-007** | Section 4.1 | Honest Gateway Gate (Production Sparrow SMS API credentials requirement) | `services/api/src/modules/auth/sms/sparrow-sms-provider.adapter.ts` | Code inspection & production configuration | **VERIFIED** |
| **BR-GOV-001** | Section 6.1 | Identity / Person Separation (Account creation NEVER creates person record) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **BR-GOV-004** | Section 6.1 | Self-Elevation Prohibited (Admins cannot elevate themselves or grant unauthorized roles) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts`, `test/auth.integration.spec.ts` | **VERIFIED** |
| **BR-GOV-005** | Section 6.1 | Branch Authority Limitation (Branch admins cannot verify outside assigned branch) | `services/api/src/modules/auth/guards/branch.guard.ts` | `services/api/src/modules/claims/claims.controller.ts` | **VERIFIED** |
| **BR-GOV-008** | Section 6.1 | Tamper-Evident Audit Logging (SHA-256 chain, immutable trigger) | `services/api/src/database/repositories/audit.repository.ts` | `test/audit.service.spec.ts`, `test/database.integration.spec.ts` | **VERIFIED** |
| **EC-0011** | Section 11 | Expired OTP Challenge Rejection (`AUTH_1002`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **EC-0012** | Section 11 | Exceeded OTP Verification Attempts Lockout (`AUTH_1003`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **EC-0013** | Section 11 | Atomic OTP Challenge Deletion on Verification | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **EC-0014** | Section 11 | Resend Cooldown Enforcement (`AUTH_1004`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **EC-0020** | Section 11 | Refresh Token Reuse Detection & Universal Revocation (`AUTH_1011`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts`, `test/auth-flow.integration.spec.ts` | **VERIFIED** |
| **EC-0023** | Section 11 | Unclaimed Account Registration (`person_id = NULL`) | `services/api/src/database/repositories/user.repository.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |
| **EC-0225** | Section 11 | Rate Limit Exceeded on OTP Request (`SYS_9003`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.service.spec.ts` | **VERIFIED** |
| **EC-0230** | Section 11 | Self-Elevation Attempt Rejection (`AUTH_1013`) | `services/api/src/modules/auth/auth.service.ts` | `test/auth.integration.spec.ts` | **VERIFIED** |

---

## 3. Storage Architecture: D: Drive Persistence

Both database engines adhere strictly to the enterprise D: drive storage boundary:
1. **PostgreSQL 16**:
   - Cluster Name: `kashyap` on port `5433` (bridged to `127.0.0.1:5434` for Windows host services).
   - Data Directory: `/mnt/kashyap_pg/pgdata` backed by `D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`.
   - Logging: `/mnt/kashyap_pg/logs/postgresql-16-kashyap.log`.
2. **Redis 7**:
   - Port: `6379` (bound to `0.0.0.0` inside WSL).
   - Persistence Directory: `/mnt/kashyap_pg/redis` (`dump.rdb` and `redis.log`).
   - Systemd Sandboxing Override: `/etc/systemd/system/redis-server.service.d/override.conf` granting explicit `ReadWritePaths=-/mnt/kashyap_pg/redis`.

---

## 4. Administrative Portal Implementation (`apps/admin`)

The Next.js administration portal includes:
- **API Client** (`apps/admin/src/lib/api-client.ts`): Fully typed wrapper for requesting OTP, verifying OTP, rotating refresh tokens, logging out, and retrieving user profiles.
- **Authentication Context** (`apps/admin/src/context/auth-context.tsx`): React Context providing `login`, `logout`, token persistence in `localStorage`, and proactive role evaluation (`isAdmin`, `isSuperAdmin`, `isBranchAdmin`).
- **Bilingual Login Page** (`apps/admin/src/app/login/page.tsx`):
  - Form validation for Nepali mobile numbers (`98XXXXXXXX` / `97XXXXXXXX`).
  - Cooldown timer countdown showing remaining seconds before allowing resend.
  - 6-digit OTP entry with automated numeric sanitization.
  - Clear Access Denied screen for verified users lacking administrative roles (`SUPER_ADMIN` or `BRANCH_ADMIN`), instructing them to contact the central administrator.
- **Dynamic Header** (`apps/admin/src/components/AdminHeader.tsx`):
  - Displays authenticated phone number and active role badge (e.g., `Super Admin`, `Branch Admin`).
  - Interactive Logout button triggering server session revocation and clearing local client state.

---

## 5. Automated Verification Results

| Test Suite | File | Tests | Result | Execution Time |
| :--- | :--- | :---: | :---: | :---: |
| **Auth Unit Tests** | `services/api/test/auth.service.spec.ts` | 13 | **PASS** | ~29.5s |
| **Phone Util Unit Tests** | `services/api/test/phone.util.spec.ts` | 5 | **PASS** | ~1.2s |
| **Localization Tests** | `services/api/test/localization.spec.ts` | 12 | **PASS** | ~25.2s |
| **Nest Graph Startup** | `services/api/test/nest-startup.spec.ts` | 2 | **PASS** | ~30.8s |
| **Core Services Unit Tests** | `services/api/test/*.spec.ts` (12 suites total) | 78 | **PASS** | ~33.4s |
| **Real PG Integration** | `services/api/test/database.integration.spec.ts` | 12 | **PASS** | ~7.8s |
| **Real PG/Redis Auth Integration** | `services/api/test/auth.integration.spec.ts` | 6 | **PASS** | ~11.7s |
| **E2E HTTP Auth & Permissions Flow** | `services/api/test/auth-flow.integration.spec.ts` | 8 | **PASS** | ~15.3s |
| **Next.js Admin Build** | `apps/admin` (`pnpm run build`) | N/A | **PASS** | ~8.4s |
| **Workspace Typecheck** | `pnpm run typecheck` | N/A | **PASS** | ~6.1s |

---

## 6. Honest Documentation Gate: HG-007 (Sparrow SMS Activation)

In accordance with requirement **AUTH-FR-012** and gate **HG-007**, synthetic OTP bypass is strictly blocked in production (`NODE_ENV === 'production'`).

To activate live SMS delivery via Sparrow SMS in production:
1. Obtain enterprise credentials from Sparrow SMS (Nepal).
2. Set the following environment variables in production:
   - `SPARROW_SMS_TOKEN`: Enterprise API authorization token.
   - `SPARROW_SMS_FROM`: Approved Sender ID / Identity (e.g., `KashyapOrg`).
   - `SPARROW_SMS_API_URL`: (Optional, defaults to `http://api.sparrowsms.com/v2/sms/`).
3. If credentials are unset in production, `SparrowSmsProviderAdapter` throws a fatal configuration error during startup, preventing unauthenticated deployment.
