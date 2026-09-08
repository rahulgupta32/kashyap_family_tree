# ADR-002: Next.js with TypeScript for Administration Portal

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: ADM-FR-001..016, CLAIM-FR-001..012, DUP-FR-001..009, AUD-FR-001..005, NFR-SEC-001..005

## 1. Context
Administrative workflows (profile claim adjudication, genealogy merge conflicts, branch authority governance, cultural content publishing, and immutable audit inspection) require a robust, responsive web application for desktop administrators, verifiers, and historians.

## 2. Decision
Use **Next.js 14+ (App Router) with TypeScript, Tailwind CSS, and TanStack Table** for the Administration Web Portal.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Vite SPA (Pure Client React)** | Lacks server-side session handling and SSR security boundaries; SEO-friendly public landing pages would require separate hosting. |
| **Remix** | High quality, but Next.js has broader ecosystem support within enterprise web teams and seamless Vercel/Node container deployment. |
| **Angular** | Higher boilerplate and slower development velocity for rapid admin console prototyping. |

## 4. Consequences
- **Positive**: Type-safe shared contracts (`@kashyap/contracts`); server actions and SSR for protected admin route gating; rapid UI composition with Tailwind.
- **Negative**: Node.js runtime required for SSR in container environments.

## 5. Security & Privacy Impact
- HTTP-only Secure SameSite cookies for admin JWT session management.
- Multi-factor authentication (MFA) enforcement on all admin routes.
- Role-based route middleware gating based on branch authority scope.

## 6. Scaling Impact
- Static generation for public heritage content; server-side rendering for real-time queue dashboards with sub-100ms response.

## 7. Operational Impact
- Standardized containerized build deployed via Docker container on D-drive infrastructure.
