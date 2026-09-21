# Pull Request: Phase G2 Engineering Foundation & Monorepo Baseline

**Source Branch**: `develop`  
**Target Branch**: `main`  
**PR Title**: `feat(g2-foundation): Monorepo Packages, NestJS API, Next.js Admin, and Verified Foundation Baseline`  
**GitHub Comparison Link**: [https://github.com/rahulgupta32/kashyap_family_tree/compare/main...develop](https://github.com/rahulgupta32/kashyap_family_tree/compare/main...develop)  
**Create PR Link**: [https://github.com/rahulgupta32/kashyap_family_tree/pull/new/develop](https://github.com/rahulgupta32/kashyap_family_tree/pull/new/develop)

---

## 1. Summary of Changes

This Pull Request delivers the complete **Phase G2: Engineering Foundations** baseline for the Kashyap Adhikari Family Tree platform:

1. **Monorepo Architecture (pnpm Workspaces)**:
   - Synchronized shared packages (`@kashyap/contracts`, `@kashyap/localization`, `@kashyap/design-tokens`, `@kashyap/test-fixtures`) with strict topological compilation and package exports.
   - Strict `pnpm-lock.yaml` tracking with `--frozen-lockfile` enforced in CI.

2. **Architecture Decision Records (ADR-001 through ADR-012)**:
   - Full 8-dimensional ADR documentation across Flutter, Next.js Admin, NestJS Modular backend, PostgreSQL datastore, Redis cache, S3 media storage, REST/WebSocket protocols, Trigram search, Cultural Rule Engine, IaC, and Append-Only Audit persistence.

3. **Database Schema & Migrations (`database/migrations/`)**:
   - `000_schema_migrations.sql`: Idempotent migration execution tracking table.
   - `001_initial_schema.sql`: Hardened DDL for 30+ tables with GIN trigram indexes, foreign key constraints, privacy classifications, soft deletion, and immutable database trigger on `audit_logs`.
   - `001_initial_schema.down.sql`: Reversible rollback / forward recovery script.

4. **NestJS Modular Backend API (`services/api/`)**:
   - `AuthModule`: Phone format validation, OTP generation/verification, rate limiting (5 attempts max), JWT session issuance.
   - `GenealogyModule`: Person profile queries, directed graph cycle detection (rejecting loops like A->B->C->A), and Account-Person separation.
   - `ClaimsModule`: Profile claim submission, evidence attachments, and self-verification prohibition (recusal governance).
   - `ChangeRequestsModule`: Governed modification workflows and snapshot generation.
   - `CulturalRulesModule`: Kinship Nata/Saino path calculator with Open Gate **HG-002** unapproved state safety checks and neutral fallbacks.
   - `AuditModule`: Append-only audit logger with SHA-256 cryptographic hash chaining and automated tamper detection.

5. **Next.js Admin Portal (`apps/admin/`)**:
   - Next.js 14 App Router layout with bilingual sidebar, executive metrics cards, and Open Authority Gates status banner.

6. **Automated Unit & Governance Test Suite**:
   - 7 test suites, 37 tests (100% PASS in clean checkout).

---

## 2. Remediation Commits on `develop`

- `8b201c5`: `feat(core): implement monorepo packages, backend API modules, admin portal & tests`
- `23fdb9e`: `feat(g2-remediation): expand test suite, harden schema, and strengthen ADRs`
- `5358a53`: `chore(build): track pnpm-lock.yaml and ignore .next build artifacts`
- `04e5be3`: `chore(typecheck): add typecheck scripts to all workspace packages`
- `01f56b6`: `chore(git): ignore tsbuildinfo files`
- `1868fd4`: `fix(monorepo): configure deterministic build order, exports maps, and tsconfig paths`

---

## 3. Clean-Checkout Verification Evidence

Independent verification executed in `D:\Jyphra\temp\kashyap_family_tree\clean-test-20260909-032800\repo`:
- `pnpm install --frozen-lockfile` (Exit Code 0)
- `pnpm run build:packages` (Exit Code 0)
- `pnpm run build:apps` (Exit Code 0)
- `pnpm run typecheck:packages && pnpm run typecheck:apps` (Exit Code 0)
- `pnpm run test` (Exit Code 0 — 7 test suites, 37 tests passed)
- Secret Scanning: 0 exposed secrets or credentials found.

---

## 4. Disclosures & Human Gates

> [!WARNING]
> **Persistence Boundary Disclosure**: Services currently operate on in-memory repositories with synthetic test fixtures (`@kashyap/test-fixtures`). Full PostgreSQL ORM persistence against `001_initial_schema.sql` is scheduled for Phase G3 Core Genealogy.

> [!IMPORTANT]
> **Repository Visibility Reminder**: The GitHub repository is currently **Public**. Jyphra administrators should set visibility to **Private** in repository settings if desired.

> [!NOTE]
> This Pull Request is submitted for Jyphra review and should NOT be merged automatically.
