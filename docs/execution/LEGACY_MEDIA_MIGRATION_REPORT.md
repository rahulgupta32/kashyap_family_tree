# Reviewed migration of legacy media to private S3

This checkpoint advances MEDIA-FR-006 and ADM-FR-016 without closing signed acceptance.
All 260 frozen Release 1 requirements and all 31 NFR targets remain mandatory.

## Implemented workflow

Migration 028 stores reviewed source snapshots, queue progress and exact destination
receipts. A completed inventory of the current storage can identify checksum-verified
legacy profile, chat and derivative assets. Global Super Admin approval requires a
reason and 1–20 distinct selected findings. The server rechecks private/CLEAN status,
active or legal-held retention, exact configured source location, shared references,
pending deletion jobs and source integrity. Approval and audit intent commit together;
repeated pending approvals do not create duplicate jobs.

The worker locks account/asset/queue state, checks the approved size/type/checksum and
storage scope again, reads bounded verified source bytes, writes a fresh generated private
key through the durable write journal, and verifies the recorded destination version.
Only then does it atomically replace the asset's storage pointer, record audit intent
and mark the queue processed. Asset IDs, uploader, scan state, retention state, checksum,
photo references, claim/chat links and derivative relationships remain unchanged.
Legal-held assets can be copied; neither their hold nor their source bytes are released.
Account locks use NO KEY UPDATE so the separate journal pool can read its uploader FK.

Changed/deleted/shared sources and missing or altered bytes stop for review. Storage or
transaction failures retry with bounded backoff; five failures require renewed review.
A successful copy followed by rollback leaves the old asset pointer and source intact;
its unlinked destination remains private and journaled for the existing orphan-review
workflow. A lost asset COMMIT acknowledgement cannot reset a processed queue or delete
its committed version. Each retry uses a fresh key, so uncertain earlier writes are not
overwritten. Migration does not delete any local source file or backup.

Optional legacy reads reuse existing application authorization and integrity checks.
They require an explicit bounded source mount and exact original location prefix;
unmapped locations and symlinks fail closed. Newly uploaded bytes always use S3.
The bilingual operations page shows verified migration findings and redacted queue
status, requires a reason/confirmation and hides pending/processed selections.

## Operator configuration and review

Deploy this code with private S3 configuration first. Mount the existing uploads directory
read-only at an absolute bounded path and set MEDIA_LEGACY_STORAGE_PATH to that path.
When stored database paths differ from the mounted path, set MEDIA_LEGACY_LOCATION_PREFIX
to the exact original uploads directory, including a Windows D: prefix if applicable.
The mapping only accepts existing managed generated filenames and logical chat/derivative
subdirectories. It does not accept source paths from HTTP requests. A configured unreadable
source mount makes media readiness fail. Configuration fingerprints require a new inventory
when the destination or legacy mapping changes.

Start/resume a media inventory, inspect LEGACY_MIGRATION_REVIEW findings, select eligible
assets and approve with a concrete reason. Workers run every minute outside tests. Review
PENDING, PROCESSED or REVIEW_REQUIRED outcomes through inventory findings. Run a new
inventory after completion to verify destination bytes and references. Keep original D:
files and backups intact; their eventual governed retention/disposal remains a separate
release obligation. No real user files are migrated by this engineering checkpoint.

## Verification scope

Four storage unit cases cover Windows-prefix mapping, retained originals, explicit opt-in,
symlink/tampering refusal, configuration fingerprints invalid root configuration and unavailable-mount readiness.
Ten isolated real PostgreSQL cases use a mocked S3 transport to exercise authority,
redacted reports, stable identity/references, retries, verification failure, worker recreation, stale/deleted/
shared sources, deletion queues, legal holds, audit rollback, lost COMMIT and rollback guards.
The dedicated real S3/PostgreSQL suite separately migrates held profile/chat/derivative
files, verifies private unsigned access and authorized reads, retains all local sources
and checks derivative/conversation references. The browser migration approval scenario
uses mocked inventory responses; existing inventory/browser upload flows use the live API.
Exact-commit execution results are recorded in PR #5 after CI completes.

## Remaining mandatory work

A real production source-mount review, approved migration batch, S3 IAM/encryption/provider
acceptance, backup/restore rehearsal and source/backup retention decisions remain open.
Historical filenames outside the managed pattern and unknown locations require separate
reconciliation; no arbitrary import or untracked-file deletion is offered. Community/gallery
media, broader entity lifecycle policies, complete operational dashboards and release-wide
security/load/accessibility/device/provider/authority acceptance remain mandatory. This
checkpoint performs no merge or production deployment and opens no HG authority gates.
