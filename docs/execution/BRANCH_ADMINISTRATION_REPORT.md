# Branch and generation metadata administration — 2026-10-09 Nepal time

Owner: Jyphra Technology Pvt. Ltd. Requirement: ADM-FR-007, mandatory Release 1.

## Implemented behavior

Migration 045 retains branch metadata versions, branch-scoped labels for generation integers 1–100, and append-only prior/new snapshots. The API and bilingual `/branches` console allow a current active, phone-verified Super Admin to create branches, revise branch names/heritage descriptions, create generation labels, revise them and read paginated history. Branch codes and generation numbers are immutable in these editing interfaces. No delete or mass Person rewrite route exists.

Authorization reads and holds current account/role rows within each transaction. Optimistic versions and branch row locks serialize competing edits. Duplicate creation returns a conflict without overwriting an existing record. Names, optional descriptions, reasons, IDs and cursors are validated; arbitrary actor, role and configuration fields are rejected. The API returns no phone numbers, credentials, account projections or Person details. Reads use private/no-store headers and fail closed when durable audit intent cannot be recorded.

Metadata writes, revision snapshots and audit intent commit together. Before the first console edit of an existing branch, its prior metadata is retained with a null original actor and an explicit pre-console snapshot reason. Original creation provenance is not invented. History update/delete is rejected by PostgreSQL; rollback refuses to discard governed records. The web interface clears state on session changes and rejects late responses, requires a reason, and requires fresh review after conflicts.

Person branch assignments, generation integers and graph links are preserved. Cross-branch parent/spouse links and branch transfers continue through existing genealogy change requests, independent review and branch/recusal checks. The console links to that review workflow; it does not replace it or treat generation display labels as trusted genealogy corrections. Heritage descriptions do not activate cultural rules.

## Verification

Local API/admin type checks and production builds pass. All 201 existing API unit tests pass. Browser test collection contains 38 scenarios, including one new branch/generation create-edit-reload/history scenario. Frozen-ledger validation preserves all 260 original acceptance records and all 31 exact NFR targets.

Eight dedicated real PostgreSQL/HTTP scenarios cover current/revoked authority, validation/duplicate creation, concurrent edits and immutable history, legacy snapshot provenance, audit rollback/fail-closed reads, generation bounds and unchanged real Person/link fixtures, pagination, and rollback refusal. The dedicated browser scenario verifies retained reasons and persistence after reload. These database/browser cases require execution in CI; collection is not acceptance. Full exact-head CI is pending until its final results are recorded in PR #5. No local real-PostgreSQL result is claimed.

## Remaining mandatory scope

ADM-FR-007 is **partial**, not complete. Remaining work includes governed Person generation corrections, a full cross-branch connection/repair console with evidence and current authority checks, reconciliation of every legacy metadata writer/import path, and complete accessibility/production acceptance. Existing seed/repository writes are not claimed to have retrospective versioned metadata history. Catalogue creation does not constitute approval of real genealogy or cultural authority.

Current assessment: 102 completed / 131 partial / 15 missing / 12 external gates. The 15 missing rows comprise two functional workflows (CAL-FR-005 family recurring reminders and ADM-FR-013 import/dry-run/reconciliation) and thirteen dedicated NFR evidence gaps. Every partial/external requirement remains mandatory; all 260 signed acceptance rows are open. PR #5 remains draft. No merge or production deployment is performed.
