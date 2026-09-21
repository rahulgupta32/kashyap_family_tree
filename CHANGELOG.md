# Changelog

All notable changes to the Kashyap Adhikari Family Tree platform are documented in this file.

## [Unreleased] - Phase G2: Engineering Foundations Verified

### Added
- Monorepo package architecture using pnpm workspaces (`@kashyap/contracts`, `@kashyap/localization`, `@kashyap/design-tokens`, `@kashyap/test-fixtures`).
- Hardened Architecture Decision Records (`ADR-001` through `ADR-012`) with 8-dimensional rigor.
- Complete PostgreSQL 16 baseline schema (`001_initial_schema.sql`) for 30+ tables with GIN trigram indexing, foreign key constraints, privacy classifications, and immutable triggers on `audit_logs`.
- Reversible rollback script (`001_initial_schema.down.sql`) and migration tracker table (`000_schema_migrations.sql`).
- NestJS Modular Backend API service (`@kashyap/api`) with Auth, Genealogy, Claims, ChangeRequests, CulturalRules, and Audit modules.
- Next.js 14 Administration Web Portal (`@kashyap/admin`) with App Router layout, dashboard metrics, and Open Authority Gates status banner.
- Automated unit test suite with 7 test suites and 37 tests (100% passing).
- Clean-checkout verification report (`docs/execution/PHASE_G2_VERIFICATION_REPORT.md`) and Pull Request documentation (`docs/execution/PULL_REQUEST_G2_FOUNDATION.md`).
- Strict frozen lockfile CI workflow (`.github/workflows/ci.yml`) enforcing `pnpm install --frozen-lockfile`.
- Synthetic test data runtime safeguards with `IS_SYNTHETIC` markers.

### Changed
- Configured topological monorepo build order (`build:packages` -> `build:apps`).
- Configured standard `exports` maps across all shared packages.
- Configured `.gitignore` to track `pnpm-lock.yaml` and ignore `.next/`, `dist/`, and `*.tsbuildinfo`.
