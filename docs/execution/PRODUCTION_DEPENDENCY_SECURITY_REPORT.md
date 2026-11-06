# Production dependency security checkpoint

The production registry audit initially reported 4 critical, 25 high, 29 moderate and 6 low findings. The patched dependency graph reports zero findings at every severity. Machine-readable before/after reports accompany this checkpoint. These are dependency findings, not a count of confirmed exploitable application defects.

## Changes

- Upgrade Next.js from 14.2.3 to 15.5.27 while retaining React 18.
- Upgrade NestJS and its Express adapter to 11.2.7, associated Nest packages, and Express 5 type definitions.
- Patch transitive qs, proxy-addr, source-map-js, js-yaml and PostCSS through explicit pnpm overrides.
- Pin pnpm 9.15.9 for reproducible override behavior locally and in every CI job.
- Make the production dependency audit a mandatory CI step, failing for any reported vulnerability severity with no allowlist.
- Generate Next route types before clean-checkout type checking.

## Validation

Local final-graph checks passed: workspace type checks, Nest API production build, and all 201 API unit tests. Full integration and browser regression results must be verified on the published commit because the HTTP adapter moved to Express 5. Production build and CI results are recorded in PR #5.

## Release limits

This checkpoint does not close security review, penetration testing, operational acceptance, or the frozen functional scope. No production deployment or merge is authorized by this report. Production readiness remains unaccepted until the remaining mandatory requirements and external evidence are complete.
