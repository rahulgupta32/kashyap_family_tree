# Durable media writes and reviewed orphan cleanup

This checkpoint advances MEDIA-FR-006 and ADM-FR-016. All 260 frozen requirements
and 31 NFR targets remain mandatory. Production and signed release acceptance remain open.

## Write provenance and fencing

Migration 027 reserves each generated media key before physical storage writes, with
uploader, storage scope, size, checksum and MIME provenance. A separate bounded PostgreSQL
pool (two additional connections per API process) commits this journal independently of the
caller transaction. Database connection budgets must include this pool. Reservation failure
prevents writing bytes. A failed PUT acknowledgement or journal update leaves a durable
WRITING intent for inventory reconciliation. Successful writes record the exact object
version as STORED. An asset trigger atomically verifies provenance and marks COMMITTED.
A rolled-back asset transaction leaves the independently committed storage intent visible.
The trigger serializes links with abandonment and rejects subsequent links or key reuse.
Legacy assets remain supported; this is not a legacy transfer/backfill implementation.

## Review and cleanup

Inventory distinguishes active uploads, expired journaled writes, fenced writes and linked
write anomalies. Existing unmanaged/untracked objects remain for reconciliation. Reports
include logical area, expected size/type/checksum and cleanup status, without exposing
storage paths, credentials or media bytes. Findings remain observations at scan time.

Only a global Super Admin can approve 1–20 selected expired journaled uploads from a
completed inventory of the current storage. A concrete reason is required. The server locks
and rechecks the uploader and intent, requires both expiry and at least 24 hours of age,
verifies exact known location, rejects any current asset references or uploader legal holds,
and commits permanent abandonment, a deletion job and approval audit intent together.
Uncertain WRITING intents use the exact version observed in inventory. No historical or
unjournaled object is eligible. Repeated pending/processed approvals create no duplicate jobs.

The worker checks current storage configuration, intent fencing, references and holds again,
reads the exact object with size/checksum verification, and deletes that version only.
Changed integrity remains for review. Missing bytes reconcile as already absent. Failures
retry with bounded backoff; five failures require review. Review-required jobs can be
explicitly approved again after current protections are resolved. An audit rollback after
physical deletion is recoverable through the durable fence and a subsequent absent-object
check. A lost commit acknowledgement cannot reset a processed job. Neither inventory nor
this approval flow releases legal holds. Rollback refuses removing durable journal evidence.

The bilingual administration page separates existing-asset recovery from orphan approval,
shows provenance and cleanup outcomes, requires a reason and permanent-deletion confirmation,
and hides selection for pending/processed cleanup. Session changes invalidate pending results.

## Verification scope

Two storage unit cases cover reservation-before-write ordering, exact version acknowledgement,
fencing failure and no physical write on reservation failure. Ten real PostgreSQL cases cover
source/derivative provenance, outer rollback, uncertain writes, classifications/redaction,
authority, audit rollback, stale links, holds, retries, integrity and lost commit acknowledgement.
The real S3 suite covers an accepted PUT whose acknowledgement is lost, exact-version cleanup,
late-link rejection, preservation of a later version and current referenced attachment bytes.
The browser approval scenario uses mocked inventory responses to verify selection, reason,
confirmation and pending-state rendering; the existing inventory browser scenario uses the
live API. Exact-commit execution results are recorded in PR #5 after CI completes.

## Remaining mandatory work

Approved legacy local-to-S3 backfill and reconciliation of untracked objects remain open,
as do community/gallery integration and broader owning-entity retention acceptance. Production
S3 IAM/version support, connection budgets, retention of journal metadata, recurring inventory,
operational alerts, load/device/accessibility/security acceptance, provider configuration,
backup/restore rehearsal and signed authority gates still need completion. No merge or
production deployment is performed by this checkpoint.
