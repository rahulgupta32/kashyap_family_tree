# ADR-006: Private S3-Compatible Object Storage for Media Assets

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
User profile photos, historical family documents, claim proof attachments, event invitation covers, and cultural media require durable, scalable, and access-controlled binary storage.

## Decision
Use **S3-compatible Object Storage** (MinIO for local development / testing; AWS S3 / Cloudflare R2 / MinIO Cluster for production) with short-lived presigned URLs for private asset access.

## Rationale
- Standardized S3 API across local development and any cloud provider
- Strong access control via presigned upload/download URLs preventing direct public exposure of sensitive identity proofs
- Automated lifecycle policies and media virus/content scanning hooks
