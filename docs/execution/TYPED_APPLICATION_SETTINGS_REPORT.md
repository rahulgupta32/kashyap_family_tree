# Typed application settings — 2026-10-08

ADM-FR-015 now has a bounded implementation for calendar invitation account count (1–100), genealogy Person count (1–1000), verified parent-edge count (1–10000) and new preview lifetime (1–10 minutes). Initial values preserve the previous fixed bounds. Arbitrary environment variables, credentials, authentication controls, cultural authority and release gates are outside this catalogue.

## Authority and durable changes

GET/PATCH `/admin/settings` and per-key history require a current active, phone-verified, unsuspended, undeleted Super Admin account. Authority is checked in PostgreSQL and held with share locks throughout each operation. Existing production privileged MFA and session freshness checks still apply. JWT role claims alone cannot grant access. Responses are private and not cacheable.

Each edit requires an integer within the fixed bounds, the current version and a trimmed 10–1000-character reason. Unknown fields/keys, coerced values, no-op edits and stale versions are rejected. A row lock serializes competing edits; the losing stale writer receives 409. Migration 044 seeds explicit system-default revisions and adds database triggers for consecutive versions, recorded old/new values and append-only history. Audit intent, value and revision commit together; audit failure rolls them back. Read/history audit failure also fails closed. History is paginated in groups of 50.

## Runtime behavior

Explicit invitation preview/create/replacement and the eligible picker enforce the stored account cap. Genealogy resolution enforces configured Person, edge and eligible account bounds without truncating rosters. Policy reads have no process cache or silent fallback and hold share locks during transactional selection. New preview expiry uses the database clock. Values and policy versions are captured in the immutable selection basis and fingerprint, so changing a setting requires a fresh preview even when its eventual recipient list would be unchanged. Previews from before this rollout also require regeneration.

Tightening limits does not rewrite already-created invitations. Metadata-only event edits retain their original roster and evidence. New or replaced recipient selection must satisfy the current policy. Existing consumed evidence remains immutable.

## Admin interface and verification

The bilingual `/settings` page shows labelled bounds/current values, requires a reason, submits a version and renders paginated before/after history. Session changes clear prior data; request epochs discard stale responses. Conflicts clear stale forms and reload the catalogue for deliberate review rather than automatically retrying writes.

Dedicated disposable PostgreSQL/HTTP tests cover current authority/revocation, strict validation, competing writers, append-only history, service reconstruction, atomic audit rollback, explicit/derived caps, database expiry, stale previews, retained existing rosters and history pagination/rollback refusal. A real browser scenario edits preview lifetime, verifies history and restores its original value. Local builds/typechecks and existing units are checked; full exact-head PostgreSQL, browser, Flutter, S3/scanner and Android results are recorded in PR #5 when complete. Pending wording in this committed report is superseded by the final exact-head PR evidence.

## Remaining release scope

This is partial ADM-FR-015 evidence; the broader approved typed settings catalogue and production acceptance remain open. Current counts: 102 bounded implementations completed, 130 partial, 16 missing (3 functional and 13 dedicated NFR evidence), 12 external gates. All 260 original signed acceptance rows and frozen quality targets remain mandatory and open. No authority approval, production infrastructure, restore/load acceptance, merge or deployment is supplied by this change.
