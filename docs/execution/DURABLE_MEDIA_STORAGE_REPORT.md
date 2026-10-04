# Durable private media storage implementation

This completion block implements private S3-compatible persistence for profile uploads,
claim evidence reads, and chat attachments. It does not close final release acceptance.
All 260 frozen requirements and cultural authority gates remain in scope.

## Behavior and verification

- Shared AWS SDK v3 storage adapter; private generated object keys, conditional writes,
  SHA-256 and length checks, bounded reads, request deadlines, and no public ACLs.
- Production/staging refuse the local backend and HTTP object-store endpoints. Readiness
  reports degraded when the configured S3 bucket cannot be reached.
- S3 uploads record the exact object version in `storage_path`; reads and cleanup use
  that version, including the explicit null version for unversioned objects. Cleanup
  deletes the recorded version rather than creating a delete marker.
- Profile, evidence and conversation endpoints retain authentication, live authorization,
  scan and retention checks. Responses are uncached and disable MIME sniffing.
  Claim evidence endpoints and linking reject conversation attachment assets.
- Upload/database failures reconcile committed asset records before removing bytes.
  An uncertain storage write or unavailable reconciliation retains potential orphan
  bytes for investigation rather than risking deletion of a committed upload.
- Durable cleanup retries pending rows every minute outside tests. Each row locks both
  asset and queue state while deleting bytes; legal holds, active assets, changed paths,
  storage failures and unsafe local paths remain pending with recorded attempts.
- Local development storage remains supported with generated-path, symlink, size and
  checksum checks. Existing local files are not silently moved or removed on S3 enablement.
- Migration 024 expands storage locations to text; rollback refuses truncation.
- The HTTP JSON limit supports the existing 10 MiB profile upload contract.

Local API typecheck, build and 148 unit tests passed. The new separate CI job uses a
pinned, disposable MinIO fixture and real isolated PostgreSQL. It verifies private
unsigned storage access, application authorization, instance recreation, concurrent
retries, scanner outage, lost database commit acknowledgement, tampered bytes,
retryable deletion, legal holds, and version-pinned reads/physical deletion.
Remote CI results are recorded in PR #5 after the published head finishes.

## Configuration and production acceptance still required

Set `MEDIA_STORAGE_BACKEND=s3`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION` and, for an S3-compatible
provider, `MEDIA_S3_ENDPOINT` and `MEDIA_S3_FORCE_PATH_STYLE=true` as appropriate. The AWS
SDK credential chain supports workload roles or environment credentials. Do not commit
credentials. Production credentials must be restricted to the configured bucket and
private-profiles/private-chat prefixes with GetObject/GetObjectVersion, PutObject,
DeleteObject/DeleteObjectVersion permissions, plus bucket-level ListBucket for readiness. Application runtime never creates buckets
or changes bucket policies. Require private bucket policies, TLS, provider-side encryption,
authority-approved retention, backups and tested restoration.

ADR-006 remains partially implemented: direct presigned uploads/downloads, quarantine
completion coordination, derivative generation, storage inventory/orphan reconciliation,
and legacy local-file backfill remain required. Downloads currently pass through the API
so role, report scope, history and retention revocation apply on every request. No provider
credentials, real deployment, production bucket-policy review or disaster recovery evidence
were supplied. A passing disposable storage fixture is not production provider acceptance.
Version-specific deletion does not assert removal of unrelated out-of-band versions or
replicated/backed-up copies; lifecycle and inventory reconciliation must cover those.

MinIO is a pinned CI compatibility fixture, not a new production-provider recommendation.
Its upstream repository is archived; operational provider/support selection remains a
production gate. The accepted ADR's AWS S3/R2 options remain available through the adapter.

Primary technical references:
- https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html
- https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z
