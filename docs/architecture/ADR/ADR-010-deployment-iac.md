# ADR-010: Containerized Deployment & Infrastructure as Code (IaC)

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
Deployments across development, staging, and production must be consistent, reproducible, secure, and vendor-neutral.

## Decision
- Containerize all backend services using multi-stage **Dockerfiles**.
- Provide `docker-compose.yml` for local development on D-drive storage.
- Manage production cloud provisioning with declarative Infrastructure as Code (Terraform / Docker Swarm / Kubernetes manifests).
