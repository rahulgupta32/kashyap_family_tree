# ADR-003: NestJS Modular Monolith Architecture for Backend Services

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: AUTH-FR, PROF-FR, GEN-FR, CLAIM-FR, CHG-FR, DUP-FR, REL-FR, CUL-FR, CAL-FR, JUT-FR, NOT-FR, INV-FR, COM-FR, MAP-FR, CHAT-FR, ADM-FR, AUD-FR, PRIV-FR, NFR-MAINT-001, NFR-SCALE-001

## 1. Context
The backend platform must coordinate 15+ functional domain modules with strict transactional boundaries, high code maintainability, clear module encapsulation, and shared TypeScript types across frontend clients.

## 2. Decision
Adopt **NestJS (TypeScript/Node.js)** structured as a **Modular Monolith** with clear domain boundaries, dependency injection, repository abstractions, and event-driven decoupling.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Microservices Architecture** | Excessive operational overhead, distributed transaction failures, network latency, and deployment complexity during initial build. |
| **Go / Gin / Echo** | High performance, but lacks shared TypeScript type system with Flutter/Next.js and increases full-stack team cognitive load. |
| **Express.js (Unstructured)** | Lacks enforced architectural patterns, leading to spaghetti code across 15+ complex business domains. |

## 4. Consequences
- **Positive**: Standardized module, controller, service, and repository structure; automated OpenAPI spec generation; seamless integration with Jest test runner.
- **Negative**: Node.js event loop requires careful async non-blocking handling for heavy graph queries.

## 5. Security & Privacy Impact
- Centralized validation pipes (`class-validator`), global exception filters, and JWT Passport authentication guards across all controllers.

## 6. Scaling Impact
- Stateless horizontal pod autoscaling (HPA); easy decomposition into dedicated worker or realtime containers if specific modules face asymmetric traffic spikes.

## 7. Operational Impact
- Single multi-stage Docker build; unified healthcheck and Prometheus metrics export.
