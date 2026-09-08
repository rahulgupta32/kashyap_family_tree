# ADR-002: Next.js with TypeScript for Admin Portal

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
The platform requires an administrative web portal for community admins, branch verifiers, super admins, content editors, and moderators to manage claims, genealogy corrections, duplicates, cultural content, branch authorities, and audits.

## Decision
Adopt **Next.js (App Router) with TypeScript, Tailwind CSS, and TanStack Query/Table** for the web-based Administration Portal.

## Rationale
- Standardized, mature enterprise React framework with robust TypeScript support
- Server-side rendering (SSR) and API routes for secure admin session handling
- Rich ecosystem of UI components, data tables, and charting libraries
- High developer productivity with strong type safety across the stack

## Consequences
- Fast, secure internal admin UI
- Reusable UI component architecture
- Consistent TypeScript models across backend and frontend packages
