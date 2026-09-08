# ADR-004: PostgreSQL as Core Relational & Graph-Relational Database

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
Genealogical data requires strong ACID guarantees, referential integrity, complex recursive queries (hierarchical family tree traversal, parent/spouse links, ancestor/descendant paths), and fuzzy Nepali/English text search.

## Decision
Use **PostgreSQL 16+** with `pg_trgm`, `btree_gist`, and recursive Common Table Expressions (CTEs) as the primary transactional datastore.

## Rationale
- Rock-solid ACID compliance, critical for immutable audit logs and genealogical lineage
- Recursive CTEs (`WITH RECURSIVE`) efficiently traverse directed acyclic graphs (DAGs) for family trees up to tens of generations
- `pg_trgm` extension enables high-performance fuzzy matching on Devanagari and Latin script names
- Support for JSONB allows flexible metadata and versioned cultural rule parameters

## Consequences
- Single resilient operational database
- Graph operations handled reliably without the overhead of maintaining a separate dedicated graph database
