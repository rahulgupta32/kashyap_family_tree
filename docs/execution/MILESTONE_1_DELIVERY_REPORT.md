# Milestone 1 Delivery & Verification Report: Local Application Foundation with Real PostgreSQL Persistence

**Platform**: Kashyap Adhikari Family Tree Platform  
**Managing Entity**: Jyphra Technology Pvt. Ltd.  
**Governing Baseline**: Kashyap Adhikari Final Implementation Documentation Baseline v1.1  
**Repository**: [https://github.com/rahulgupta32/kashyap_family_tree](https://github.com/rahulgupta32/kashyap_family_tree)  
**Branch**: `feat/m1-local-foundation`  
**Base Branch**: `develop`  
**Verified Foundation Commit**: `dad0f053e16886e3f0faee5315f60877997fb6a1`  
**Date**: 2026-09-11  

---

## 1. Executive Summary

Milestone 1 establishes a fully reproducible, database-backed local application foundation operating on real PostgreSQL 16 persistence, decoupled from in-memory fallbacks and strictly isolated to enterprise storage on the **D:** drive. All five requested core corrections have been implemented, verified, and regression-tested:

1. **NestJS Dependency Injection & Test Isolation**: Corrected `GenealogyService` provider configuration in `GenealogyModule` via a dedicated injection token (`GENEALOGY_TEST_FIXTURE_MODE`), resolving NestJS application compilation failure. Hardened fixture mode so that it is strictly rejected in `development` and `production` environments (both via static factory and direct constructor invocation). Added a full Nest application dependency graph regression test suite (`test/nest-startup.spec.ts`). Live verified `/health`, `/health/ready`, and database-backed genealogy reads on the compiled API.
2. **Reproducible D: Drive Storage Setup**: Implemented and verified `scripts/ensure-kashyap-pg.sh`, `scripts/kashyap-pg.service`, and `docs/storage-setup.md`. Confirmed PostgreSQL data directory (`/mnt/kashyap_pg/pgdata`) is backed by `D:\Jyphra\pg_data\kashyap_pg.img` via `/dev/loop0`. Validated fail-safe behavior when unmounted (refusing to auto-initialize on C:). Redirected all cluster logs to D: storage. Documented capacity, 7-step expansion, and backup recovery.
3. **Bridge Startup Fail-Fast Validation**: Updated `scripts/pg_bridge.js` to exit nonzero on missing D: image or unbacked mount, verify cluster connectivity on `wslIp:5433` before accepting connections on `127.0.0.1:5434`, and preserve local loopback binding.
4. **GitHub Actions CI/CD Configuration**: Configured `.github/workflows/ci.yml` with a native `postgres:16-alpine` service container, frozen lockfile enforcement (`pnpm install --frozen-lockfile`), workspace builds, typecheck, unit tests with Nest startup regression (`test:unit`), and real PostgreSQL integration tests (`test:integration`).
5. **Workload & Data Preservation**: The default WSL2 Ubuntu distribution virtual disk, cluster `16/main` on port `5432`, and unrelated databases (`vidyarthi`, `mala_chem`) remained completely untouched. Project cluster restart was verified, while full system/WSL reboot was not executed to preserve running background workloads.

---

## 2. Technical Implementation Details

### 2.1. GenealogyService DI Hardening & Test Isolation
* **Token Definition**: Exported `GENEALOGY_TEST_FIXTURE_MODE = 'GENEALOGY_TEST_FIXTURE_MODE'` from `services/api/src/modules/genealogy/genealogy.service.ts`.
* **Provider Configuration**: In `services/api/src/modules/genealogy/genealogy.module.ts`, registered:
  ```typescript
  providers: [
    GenealogyService,
    {
      provide: GENEALOGY_TEST_FIXTURE_MODE,
      useValue: false,
    },
  ]
  ```
* **Constructor Injection**: Annotated constructor parameter with `@Optional() @Inject(GENEALOGY_TEST_FIXTURE_MODE) explicitTestFixtureMode?: boolean`.
* **Security Guardrails**:
  - `createWithTestFixtures()` throws `FATAL SECURITY CONFIGURATION: Test fixture mode is strictly prohibited when NODE_ENV is not 'test'` if `NODE_ENV !== 'test'`.
  - Direct constructor invocation with `explicitTestFixtureMode === true` also checks `NODE_ENV === 'test'` and throws immediately if executed in `development` or `production`.
  - In normal runtime (`NODE_ENV === 'development' | 'production'`), missing dependencies remain fatal; empty database queries return empty arrays without falling back to synthetic fixtures.

### 2.2. D: Drive Storage Architecture & Exact Canonical Verification
* **Backing Image**: `D:\Jyphra\pg_data\kashyap_pg.img` (2.0 GB ext4 virtual disk).
* **WSL Mount Point**: `/mnt/kashyap_pg` (loop device `/dev/loop0`).
* **Cluster Version & Name**: PostgreSQL 16 (`kashyap`), port `5433`.
* **Data Directory**: `/mnt/kashyap_pg/pgdata` (strictly on D: ext4 filesystem).
* **Database Logs**: `/mnt/kashyap_pg/logs/postgresql-16-kashyap.log` (redirected via symlink from `/var/log/postgresql/postgresql-16-kashyap.log`).
* **Automated Script**: [`scripts/ensure-kashyap-pg.sh`](../../scripts/ensure-kashyap-pg.sh) has been hardened with:
  - **Exact Canonical Backing Verification**: Substring matching (`*kashyap_pg.img*`) has been completely replaced with exact string comparison of canonical paths resolved via `realpath -e` and device backing from `losetup -O BACK-FILE`.
  - **D: Mount Verification**: Confirms via `findmnt -T` that the canonical backing image resolves under `/mnt/d` (source `D:\`). Rejects any image path outside D:, including a symlink on D: resolving outside D:.
  - **Data Directory Verification**: Verifies both configured (`pg_conftool 16 kashyap show data_directory`) and live active (`SHOW data_directory;`) paths resolve strictly inside `/mnt/kashyap_pg`.
  - **Effective Log Destination Verification**: Verifies `/var/log/postgresql/postgresql-16-kashyap.log` is a symlink resolving inside `/mnt/kashyap_pg/logs/` on D:. Rejects existing regular files on C: with fatal exit code `1`, refusing to silently accept or write logs to C:.
* **Provisioning & Setup Guide**: [`docs/storage-setup.md`](../storage-setup.md) updated with complete, reproducible first-time provisioning instructions, strict separation from normal startup and recovery, refusal to overwrite existing data, and zero credentials in Git.
* **Storage Regression Suite**: [`scripts/test-storage-verification.sh`](../../scripts/test-storage-verification.sh) added to verify all failure cases and successful startup.

### 2.3. Fail-Fast Bridge (`scripts/pg_bridge.js`)
* Strict pre-flight checks:
  1. Verifies backing image `D:\Jyphra\pg_data\kashyap_pg.img` exists (exits code 1 if missing).
  2. Verifies mount `/mnt/kashyap_pg` is backed by `kashyap_pg.img` via WSL command (exits code 1 if unbacked).
  3. Resolves WSL IP address (exits code 1 if unavailable).
  4. Probes TCP port `5433` on WSL IP (`checkClusterReady()`). Exits code 1 if PostgreSQL is not ready.
  5. Only after all checks pass does it open listener on `127.0.0.1:5434`.

### 2.4. GitHub Actions CI Matrix (`.github/workflows/ci.yml`)
* Added PostgreSQL 16 service container:
  ```yaml
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: kashyap_user
        POSTGRES_PASSWORD: kashyap_secure_dev_password
        POSTGRES_DB: kashyap_test_db
      ports:
        - 5434:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  ```
* Enforces `pnpm install --frozen-lockfile`.
* Steps executed in CI:
  - Shared package build (`pnpm run build:packages`)
  - Workspace typecheck (`pnpm run typecheck`)
  - Application builds (`pnpm run build:apps`)
  - Unit tests + Nest startup regression (`pnpm --filter @kashyap/api run test:unit`)
  - Real PostgreSQL integration tests (`pnpm --filter @kashyap/api run test:integration` against `kashyap_test_db`)

---

## 3. Verifiable Test Evidence & Execution Results

All commands executed locally with their observed exit codes, outputs, and validation metrics:

| Step / Test Category | Command Line | Exit Code | Result / Output Summary |
|---|---|:---:|---|
| **Storage Verification** | `wsl -d Ubuntu -u root -- /usr/local/bin/ensure-kashyap-pg.sh` | `0` | Verified canonical mount `/mnt/kashyap_pg` backed by `/mnt/d/Jyphra/pg_data/kashyap_pg.img`. Configured & runtime data_directory verified in D: mount. Effective log destination verified on D:. Cluster `16/kashyap` online on port 5433. |
| **Mount & Device Inspection** | `wsl -d Ubuntu -u root -- bash -c "findmnt /mnt/kashyap_pg; losetup -a; df -h /mnt/kashyap_pg"` | `0` | `/dev/loop0` on `/mnt/kashyap_pg` (ext4, rw). Backing: `D:\Jyphra\pg_data\kashyap_pg.img`. Capacity: 2.0 GB, Used: 48 MB, Avail: 1.8 GB (3% use). |
| **Log Placement Inspection** | `wsl -d Ubuntu -u root -- bash -c "ls -la /var/log/postgresql/postgresql-16-kashyap.log; ls -la /mnt/kashyap_pg/logs/"` | `0` | Symlink `/var/log/postgresql/postgresql-16-kashyap.log` -> `/mnt/kashyap_pg/logs/postgresql-16-kashyap.log` on D: drive image. |
| **Storage Regression Suite** | `wsl -d Ubuntu -u root -- /mnt/d/Jyphra/kashyap_family_tree/scripts/test-storage-verification.sh` | `0` | **7 passed, 0 failed**:<br>1. Non-existent image path rejected (exit 1)<br>2. Same-named image outside D: on C: rejected (exit 1)<br>3. Symlink on D: resolving outside D: rejected (exit 1)<br>4. Loop device backing mismatch rejected (exit 1)<br>5. Existing regular file on C: for logs rejected (exit 1)<br>6. Log symlink resolving outside D: rejected (exit 1)<br>7. Genuine D: storage configuration succeeds (exit 0) |
| **Cluster Restart Check** | `wsl -d Ubuntu -u root -- bash -c "pg_ctlcluster 16 kashyap restart; pg_lsclusters"` | `0` | Cluster `16/kashyap` cleanly stopped and restarted on port 5433. Cluster `16/main` (port 5432) remained online and unaffected. |
| **Unit & Regression Tests** | `pnpm run test` | `0` | **11 passed, 11 total suites; 64 passed, 64 total tests**. Passed `cultural-rules`, `auth`, `chat`, `change-requests`, `claims`, `genealogy`, `audit`, `map`, `localization`, `community`, and `nest-startup`. |
| **Nest DI Startup Regression** | `services/api/test/nest-startup.spec.ts` (included in `pnpm run test`) | `0` | AppModule compiles without DI errors. `GenealogyService`, `PersonRepository`, `GenealogyLinkRepository`, `DatabaseService` resolved cleanly with `isTestFixtureMode === false`. |
| **Fixture Security Rejection** | `services/api/test/genealogy.service.spec.ts` (included in `pnpm run test`) | `0` | Rejects `createWithTestFixtures()` in development and production. Rejects direct constructor opt-in in development and production. Allows fixture mode only when `NODE_ENV === 'test'`. |
| **Real PG Integration Tests** | `pnpm run test:integration` | `0` | **1 passed, 1 total suite; 10 passed, 10 total tests** against real PostgreSQL cluster on `127.0.0.1:5434`. Validated transactions, multi-lingual names, parent-child hierarchy CTE, spouse links, rollback, and refusal of pg-mem fallback. |
| **Workspace Typecheck** | `pnpm run typecheck` | `0` | All 7 workspace projects passed without TypeScript errors (`@kashyap/contracts`, `@kashyap/design-tokens`, `@kashyap/localization`, `@kashyap/test-fixtures`, `@kashyap/api`, `apps/admin`). |
| **Workspace Build** | `pnpm run build` | `0` | All packages compiled, NestJS backend API built to `dist/`, Next.js admin portal built with static optimization (4/4 pages). |
| **Live API Health Check** | `Invoke-RestMethod http://127.0.0.1:3000/health` | `0` | HTTP 200 OK: `{"status":"ok","uptime":12.88}` |
| **Live API Readiness Check** | `Invoke-RestMethod http://127.0.0.1:3000/health/ready` | `0` | HTTP 200 OK: `{"status":"ok","database":"up","databaseType":"real-postgresql","dbLatencyMs":2}` |
| **Live API Branches Read** | `Invoke-RestMethod http://127.0.0.1:3000/genealogy/branches` | `0` | HTTP 200 OK: Returned 3 database-backed branches (Kaski, Lamjung, Tanahun) seeded in PostgreSQL. |
| **Live API Person Read** | `Invoke-RestMethod http://127.0.0.1:3000/genealogy/people/a0000001-0000-0000-0000-000000000101` | `0` | HTTP 200 OK: Returned database-backed record for Ram Chandra Adhikari with multilingual names, parents, spouses, and children. |

---

## 4. Preservation of Unrelated Workloads

* **Cluster Isolation**: Pre-existing PostgreSQL cluster `16/main` (running on port `5432` with data directory `/var/lib/postgresql/16/main`) hosts unrelated development databases `vidyarthi` and `mala_chem`. This cluster was not reconfigured, stopped, or migrated.
* **System Reboot Boundary**: Project cluster restart (`pg_ctlcluster 16 kashyap restart`) was verified. Full system/WSL reboot was deliberately avoided to ensure zero interruption to running background workloads and other containers.
* **Storage Decoupling**: The project database storage exists solely in `D:\Jyphra\pg_data\kashyap_pg.img` and backups in `D:\Jyphra\backups\pg_kashyap_20260910_pre_migration\kashyap_db.dump`. No database tables, WAL files, or logs are written to the C: drive WSL root virtual disk.

---

## 5. Pull Request & Governance Status

* **Pull Request Target**: `develop` <- `feat/m1-local-foundation`
* **Direct Pull Request URL**: [https://github.com/rahulgupta32/kashyap_family_tree/compare/develop...feat/m1-local-foundation?expand=1](https://github.com/rahulgupta32/kashyap_family_tree/compare/develop...feat/m1-local-foundation?expand=1)
* **Interactive Auth Note**: Opening a PR programmatically via `gh pr create` requires interactive authentication (`gh auth login`). The PR can be reviewed and opened directly via the URL above.
* **Milestone Boundary**: **Milestone 2 has NOT been authorized and has NOT been started.** All changes are confined to Milestone 1 scope on `feat/m1-local-foundation`.
