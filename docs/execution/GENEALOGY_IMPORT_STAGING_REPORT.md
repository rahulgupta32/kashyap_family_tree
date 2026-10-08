# Genealogy import staging and reconciliation — 2026-10-09 Nepal time

Owner: Jyphra Technology Pvt. Ltd. Mandatory requirement: ADM-FR-013.

## Implemented

The bilingual `/imports` console and `/admin/genealogy-imports` API retain bounded, schema-versioned JSON source batches separately from accepted genealogy. Staging preserves exact source spelling and original date values/calendar/precision. A canonical SHA-256 source hash makes identical retries idempotent despite JSON object key ordering. Source corrections create a distinct retained batch; existing source evidence is never overwritten.

Current active, phone-verified Super Admin authority is checked and locked in every transaction, including reads and erasure. No account is assigned a Person claim or elevated by importing. Requests reject unknown fields, including private contact and identity-document fields. Limits are 200 Persons, 400 parent links, 1 MiB per payload, 50 batches/reports per cursor page. Responses use private/no-store. Lists omit source payloads; audit intents omit source names and dates. Reads fail closed when durable audit intent fails.

Dry runs retain validator version, source hash, actor, reason, sequence, source counts, eligible target mappings, unmapped counts and explicit exceptions. Validation covers duplicate IDs/target mappings/names, consent, verification, visibility, invalid or contradictory AD dates, unsupported calendar precision/types, missing/self/duplicate parent links, unsupported parent types and cycles in the staged parent graph. BS/Tithi/approximate dates remain source values and enter an authority-review exception. Guardian/step relationships are preserved as explicit unsupported exceptions rather than coerced into biological links.

Reconciliation reads current target Person status/branch and normalized same-branch name candidates in one database statement. Existing target IDs do not authorize an update or merge. Name similarity produces a review candidate, not an automatic merge. Reports are historical snapshots, never promotion authorization. New runs recheck target changes; repeated request keys return the retained report, and changed actor/reason reuse conflicts. Per-batch row locks serialize concurrent retries and sequence allocation.

Staging, reports, erasure and their audit intents commit atomically. Batch metadata and report evidence are immutable. An explicit, confirmed console action can erase the personal source payload with a matching hash and reason; retained hashes, counts and reports remain. An erased payload cannot be resurrected by an identical staging retry. Migration rollback refuses to discard retained evidence. Erasure is a narrow privacy control; it does not replace the approved retention policy for real data.

The console rejects stale responses after session or selection changes, clears source text on session changes, supports report pagination and shows production promotion as blocked even when preliminary validation passes.

## Validation

Local workspace type checks, API/admin production builds, and all 209 unit tests pass. Eight dedicated validator tests cover source preservation, bounded shape, consent/privacy, dates, duplicates and graph exceptions. Eleven real PostgreSQL/HTTP scenarios cover live authority, concurrent staging and dry-run retries, target-state reconciliation, unchanged accepted genealogy, audit rollback, payload erasure, append-only evidence and cursor boundaries. One browser journey covers staging, exceptions, reload, a second report and source erasure. Exact published-head CI evidence is recorded in PR #5 when complete; collection or local unit execution is not represented as real PostgreSQL/browser execution.

## Remaining mandatory work

ADM-FR-013 remains **partial**. The full 14-sheet workbook mapping, accepted source/permission register, authoritative branch sampling, independent privacy and duplicate decisions, cross-batch/full-target graph validation, unions/history/disputes, field-level target reconciliation, controlled promotion writer, production idempotency/resume/stop, two isolated import rehearsals, backup/rollback/forward-fix rehearsals and operational acceptance remain mandatory. The JSON staging adapter is an initial controlled subset, not a complete workbook importer. No approved-source or branch-authority approval is fabricated from a catalogue entry or a successful validation run.

There is no production promotion endpoint in this checkpoint. Dry-run validation is not an isolated import rehearsal. No live Persons, links, branches, account claims or accepted genealogy are modified. Real datasets require Jyphra's approved mapping, privacy, authority and retention process before use; no fixture is promoted into production.

Current assessment: 102 completed / 132 partial / 14 missing / 12 external gates. The 14 missing rows comprise CAL-FR-005 recurring family reminders and thirteen dedicated NFR evidence gaps. All partial requirements remain mandatory and all 260 signed acceptance records remain open. PR #5 stays draft; no merge or production deployment is performed.
