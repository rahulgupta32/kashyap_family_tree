# ADR-006: Private S3-Compatible Object Storage for Media Assets

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: MEDIA-FR-001..006, CLAIM-FR-003, PROF-FR-003, PRIV-FR-001..008, NFR-SEC-001

## 1. Context
Citizenship proofs, birth certificates, historical lineage manuscripts, family photographs, and cultural media require durable, scalable, and access-controlled binary storage with strict privacy protection.

## 2. Decision
Use **S3-compatible Object Storage** (MinIO for local development and self-hosted environments; AWS S3 / Cloudflare R2 for production) with short-lived presigned URLs for all private asset uploads and downloads.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Local File System Storage** | Fragile across scaled multi-server deployments; lacks automated presigned URL access control and lifecycle policies. |
| **Database BLOBs in PostgreSQL** | Bloats database size and WAL backups; degrades database cache performance. |
| **Public CDN Direct Hosting** | Critical privacy violation: exposes sensitive government citizenship IDs and private family documents publicly. |

## 4. Consequences
- **Positive**: Cloud-portable S3 API; private-by-default security model; automated background image thumbnailing via workers.
- **Negative**: Extra network hop for presigned URL generation and client upload coordination.

## 5. Security & Privacy Impact
- All verification documents (Citizenship, Passport) are stored in private buckets with maximum 15-minute presigned download URLs accessible only to assigned verifiers.

## 6. Scaling Impact
- Direct client-to-storage uploads and downloads offload heavy bandwidth consumption from the NestJS API servers.

## 7. Operational Impact
- MinIO instance on D-drive storage (`D:\Jyphra\kashyap_family_tree_data\minio`) with automatic bucket creation and lifecycle rules.
