# ADR-004: PostgreSQL as Core Relational & Graph-Relational Database

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: GEN-FR-001..018, SRCH-FR-001..008, AUD-FR-001..005, NFR-DATA-001..002, NFR-REL-001..002

## 1. Context
Genealogy relationships form a Directed Acyclic Graph (DAG) requiring strict referential integrity, cycle prevention, multi-generation hierarchical traversal, and ACID transaction guarantees during claim merges and change request approvals.

## 2. Decision
Adopt **PostgreSQL 16+** with `pg_trgm`, `btree_gist`, and recursive Common Table Expressions (`WITH RECURSIVE`) as the sole primary database.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Neo4j / Dedicated Graph DB** | Polyglot persistence increases operational cost, backup fragmentation, and lacks mature Nepali full-text search extensions. |
| **MongoDB / Document Store** | Inadequate multi-document transactional consistency across recursive foreign keys and weak graph querying. |
| **MySQL** | Inferior recursive CTE optimization and weaker trigram indexing compared to PostgreSQL. |

## 4. Consequences
- **Positive**: Single transactional boundary; recursive CTEs traverse 20 generations in sub-20ms; GIN indexes accelerate fuzzy Devanagari search.
- **Negative**: Database indexing and query plans must be monitored as node count scales past 1,000,000 records.

## 5. Security & Privacy Impact
- Role-based database users, SSL/TLS in transit, transparent column-level encryption for sensitive PII, and immutable triggers on audit logs.

## 6. Scaling Impact
- Read replicas for high-volume tree query traffic; connection pooling via PgBouncer.

## 7. Operational Impact
- Automated WAL archiving, point-in-time recovery (PITR) to D-drive backups, and pg_stat_statements monitoring.
