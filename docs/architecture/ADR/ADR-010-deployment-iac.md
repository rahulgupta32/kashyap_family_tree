# ADR-010: Containerized Deployment & Infrastructure as Code (IaC)

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: NFR-PORT-001, NFR-SCALE-001, NFR-DR-001..003, Open Gates HG-008, HG-015

## 1. Context
The platform must run reliably and identically across local development machines (with D-drive volume isolation), CI test runners, staging environments, and production cloud infrastructure.

## 2. Decision
- Package all backend services (`services/api`, `services/worker`, `services/realtime`) and the web admin portal (`apps/admin`) into lightweight, multi-stage **Docker container images**.
- Use **Docker Compose** for local development with persistent storage pinned to `D:\Jyphra\kashyap_family_tree_data\`.
- Manage cloud infrastructure with declarative Infrastructure as Code (Terraform / Kubernetes manifests).

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Bare-metal / VM Manual Setup** | Environment drift, difficult disaster recovery, and lack of reproducible testing across developer workstations. |
| **Proprietary Cloud-Only PaaS (Heroku / AWS ECS specific)** | Vendor lock-in; violates portability requirement (NFR-PORT-001). |

## 4. Consequences
- **Positive**: Complete environment parity; rapid automated disaster recovery; portable across any cloud provider (AWS, GCP, DigitalOcean, local hardware).
- **Negative**: Requires container daemon runtime management and disk allocation oversight on D-drive.

## 5. Security & Privacy Impact
- Non-root user execution in all production containers; read-only root filesystems where possible; minimal base images (Alpine / Distroless).

## 6. Scaling Impact
- Horizontal container replication behind Nginx / Cloud Load Balancer with zero-downtime rolling updates.

## 7. Operational Impact
- Standardized container logging to stdout/stderr captured by Prometheus/Loki.
