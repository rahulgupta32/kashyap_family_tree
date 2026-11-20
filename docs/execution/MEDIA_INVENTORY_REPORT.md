# Resumable private-media inventory and guarded recovery

This checkpoint advances MEDIA-FR-006 and ADM-FR-016. All 260 frozen Release 1
requirements and 31 NFR targets remain mandatory; final release acceptance is open.

## Implemented behavior

Migration 026 persists inventory runs, cursors and findings. One run can be active at a
time. Global Super Admin authority is enforced on every HTTP operation; branch-scoped
administration cannot inspect cross-branch media operations. Reports expose identifiers,
logical areas and finding codes, never content bytes, physical paths, endpoints, credentials
or untrusted object names. Report pages contain at most 50 findings, with keyset pagination.

Each requested batch processes at most five database assets or 100 storage entries. Asset
pages verify bounded byte length and checksum against the existing storage adapter, record
missing/altered/unavailable locations, and identify absent image/deletion jobs. Only assets
created before the run began enter its database walk. Storage pages cover all three managed
private prefixes, including exact S3 versions and delete markers. Local development scans
use bounded selection memory and never follow directory/object symlinks. Recent unreferenced
objects receive a 24-hour grace finding; older unreferenced and unmanaged objects require
review. No unreferenced object is deleted by this workflow.

Progress, findings and audit intent commit together. Transaction failure leaves a resumable
cursor; concurrent pages serialize on the run. Service recreation can continue from its saved
cursor. Configuration fingerprints stop resuming or recovering against changed storage;
cancellation remains possible. Rollback refuses discarding inventory evidence.

A completed inventory can schedule at most 20 selected existing-asset recovery items. The
transaction locks and rechecks current asset location, scan/retention state and eligibility.
Shared storage locations are retained for review rather than scheduled for recovery.
Missing deletion queues are recreated only for currently deleted/purged assets. Missing
image jobs are created only for clean, active/held source images. Recovery neither releases
holds nor resets existing image jobs nor performs direct object deletion. Existing workers
apply their authorization-independent source state, integrity and exact-version cleanup
checks. Repeated requests do not create duplicate pending jobs; audit failure rolls back
scheduling. New legacy image jobs use the full oriented frame because no previous crop
instruction exists.

The bilingual admin surface starts, resumes, cancels, paginates and inspects inventories.
Selected recovery requires a concrete confirmation and current server authority. Account/
session changes invalidate pending UI results. Findings are observations at their individual
scan time, not a point-in-time backup or proof that concurrent writers cannot change storage.

## Verification

Unit coverage verifies bounded local pagination, symlink handling, S3 version/delete-marker
mapping and continuation. Seven isolated PostgreSQL cases cover global authority, concurrent
starts, audit rollback, restart/resume, integrity/missing/grace findings, stale legal holds,
idempotent recovery, storage scope changes and guarded rollback. The dedicated real S3 suite
adds an inventory of two unreferenced versions plus a delete marker, and verifies bytes are
retained. A browser scenario resumes across reload, inspects bounded redacted findings and
cancels a new run. Exact-head CI results are recorded in PR #5 after completion.

## Remaining mandatory scope

Production inventory IAM needs ListBucketVersions alongside existing private read/write/
version-specific delete rights. Permission failures retain progress for retry; they are not
reported as a successful empty scan. Managed S3 inventory requires version-list support.
No automatic orphan purge, inflight upload intent journal, approved legacy local-to-S3 backfill,
operator review of individual unmanaged objects, recurring inventory scheduler or full
production observability/load acceptance is claimed. These remain required work. Community/
gallery integration and broader entity-retention policies also remain open. No merge,
production deployment, HG gate opening or signed Release 1 acceptance is performed.

## Subsequent write-journal checkpoint

`MEDIA_WRITE_JOURNAL_REPORT.md` records migration 027 and the subsequent reviewed cleanup of expired journaled writes. The earlier no-orphan-cleanup statement describes this inventory checkpoint; untracked objects still remain for reconciliation.
