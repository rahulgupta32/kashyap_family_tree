# ADR-003: NestJS Modular Monolith Architecture for Backend Services

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
The platform backend must handle diverse business domains (Auth, Profile, Genealogy, Claim, Change Request, Duplicates/Merge, Nata/Saino, Cultural Content, Calendar/Tithi/Jutho, Invitations/Notifications, Community, Map, Chat, Admin, Audit) while maintaining clear architectural boundaries, strict type safety, transaction consistency, and ease of deployment.

## Decision
Adopt **NestJS (Node.js/TypeScript)** following a structured **Modular Monolith** architecture with domain-driven boundaries, repository patterns, dependency injection, and event-driven decoupling.

## Rationale
- Standardized architectural discipline (Modules, Controllers, Services, Repositories, Guards, Interceptors)
- Native integration with PostgreSQL (Prisma/TypeORM/Kysely) and Redis
- Single deployment unit during early phases with trivial path to service extraction (e.g. Realtime/Worker) if required
- Direct code sharing with TypeScript frontend packages (`@kashyap/contracts`)

## Consequences
- Clean separation of concerns across 15+ domain modules
- Enforced dependency graphs prevent circular coupling
- Testable units with dependency injection and mock providers
