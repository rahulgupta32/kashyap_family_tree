# Private image derivatives and profile crop workflow

This checkpoint advances PROF-FR-003, MEDIA-FR-002/004/005/006 and EC-0170/0172/0174/0175.
All 260 frozen Release 1 requirements and final authority/production acceptance remain mandatory.

## Implemented behavior

- Migration 025 persists image jobs, normalized crop instructions, thumbnail/display
  provenance, source checksums, dimensions, transform versions and child asset references.
  A guarded rollback refuses discarding pending work or derivative provenance.
- Originals remain unchanged in private storage. Profile displays request sanitized
  derivatives; direct source access retains existing authenticated owner/authority or
  evidence/conversation/report scope checks. Raw originals are restricted provenance/
  evidence records, not publicly served or used as a processing-failure fallback.
- Sharp 0.35.5 inspects supported JPEG/PNG/WebP dimensions (20 megapixels, 8192 per side,
  four channels, one reported frame), applies orientation before crop, and strictly decodes
  pixel data with bounded input pixels and a five-second processing deadline per output.
  WebP thumbnail/display sizes are bounded to 256/1600 pixels; output is at most 5 MiB.
  Metadata-copy operations are omitted: EXIF, GPS, XMP and IPTC do not enter derivatives.
- Crop uses integer basis points from 0–10000 with strict fields and in-image bounds.
  Profile uploads validate canonical base64, encoded/decoded size and dimensions before
  storage. Account activity is locked/rechecked before persisting any scanned upload,
  preventing a delayed upload from restoring a deleted account's avatar.
- Private derivative objects use unique generated names and exact S3 versions. Generation
  never overwrites originals. Source/link/job/audit changes commit together. Concurrent
  workers lock jobs and source state; partial output is not published. Uncertain commits
  are reconciled before candidate cleanup, preserving committed derivative bytes.
- Workers retry with backoff and stop after five failed attempts. Profile processing status
  and authorized explicit retry support safe placeholders and recovery. Original-conversation
  senders can retry their image jobs through the conversation route. PDFs are not rendered.
- Derivatives are served only through the source's authorized variant route. Generic profile
  and evidence endpoints deny child IDs. Chat variants recheck conversation history,
  membership and tombstones; reported variants retain report-scoped moderation authority.
- Source retention updates propagate to children. Deletion cancels pending work and queues
  derivative cleanup. Legal holds retain children; governed source release queues their
  deletion. Account deletion excludes independently treating derived held evidence as
  disposable media. Existing cleanup locks/retries and storage integrity checks apply.
- Web and Flutter profile controls select images, preview normalized crop, upload original
  bytes with crop instructions, show processing/ready/failure states, retry and remove photos.
  Display images are fetched with authentication. Async file/network results remain bound
  to their account. Removal detaches the avatar while preserving referenced evidence/holds.
- Android's document picker has a separate image-only 10 MiB mode without broad filesystem
  permissions. Flutter bounds native decoding dimensions and preview resolution. Existing
  chat pick/save limits remain 5 MiB.

## Verification

Local API/admin typechecks, API/admin production builds, 155 API unit tests, collection of
28 browser scenarios, and all-260/31-NFR preservation validator pass. Nine additional real
PostgreSQL cases cover provenance, concurrent processing, permission boundaries, retry
exhaustion/recovery, audit rollback, lost COMMIT, source/child deletion, legal-hold release,
conversation revocation, validation and held/non-held account deletion. The existing real
S3 fixture adds private cropped derivative storage and source/child physical cleanup.
Flutter tests cover native selection/crop upload and account-switch refusal. Android live
acceptance enables the real worker, verifies original bytes and cropped WebP, then removes
its photo through native UI. Remote exact-head CI results are recorded in PR #5 after completion.

## Remaining mandatory scope and production acceptance

Legacy image processing can be queued by its authorized profile retry route; bulk inventory,
local-to-S3 backfill and orphan reconciliation are still required. Community/gallery media,
full evidence-upload UI, direct presigned transfers, complete referenced-entity retention,
advanced editing and broader device/codec/accessibility/load/security acceptance remain open.
No source EXIF is published through derivative display, but raw-original metadata consent/
evidence retention policies still require governed production review. Native picker automation
is mocked in widgets; the emulator checks the live image worker and native removal, not the
Android system picker UI. Other mobile platforms remain unaccepted. Provider bucket policies,
IAM for the new private-derivatives prefix, encryption, backup/restore and authority approvals
must be verified before production deployment. No merge or deployment is performed here.

Primary codec references:
- https://sharp.pixelplumbing.com/api-constructor/
- https://sharp.pixelplumbing.com/api-input/
- https://sharp.pixelplumbing.com/api-operation/
- https://sharp.pixelplumbing.com/api-output/
- https://sharp.pixelplumbing.com/api-resize/
