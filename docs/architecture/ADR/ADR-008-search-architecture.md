# ADR-008: Search Architecture (PostgreSQL Trigram & Full-Text)

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: SRCH-FR-001..008, I18N-FR-001..005, NFR-PERF-001..005

## 1. Context
Users search for living and historical family members using Devanagari script (नेपाली), Latin transliterations (e.g. "Dinesh", "Ramchandra"), gotra, branch names, and generation levels with high tolerance for spelling variations.

## 2. Decision
Implement primary search using **PostgreSQL `pg_trgm` GIN indexes** with normalized Unicode name tables in the baseline phase, wrapped behind a repository interface allowing Meilisearch/OpenSearch extraction if needed at scale.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Elasticsearch / OpenSearch** | Additional operational and memory cost during initial deployment; eventual consistency synchronization lag during live profile creation. |
| **Meilisearch** | Strong typo tolerance, but additional daemon infrastructure not required for initial 100K-500K records with tuned PostgreSQL trigram indexes. |
| **Standard SQL LIKE / ILIKE** | Table scans are unacceptably slow (O(N)) for multi-token fuzzy search across large datasets. |

## 4. Consequences
- **Positive**: Zero extra infrastructure; sub-50ms search across 100K+ records using GIN trigram indexes; immediate index consistency on write.
- **Negative**: GIN index write overhead slightly increases Person insert/update time (acceptable trade-off).

## 5. Security & Privacy Impact
- Privacy visibility filters (`phone_visibility`, `dob_visibility`) applied strictly at SQL query time to prevent unauthorized PII leakage in search results.

## 6. Scaling Impact
- Composite indexes on `(branch_id, generation)` combined with trigram indexes ensure scalable sub-100ms searches for up to 1M Person records.

## 7. Operational Impact
- Requires `pg_trgm` extension enabled during database initialization (`001_initial_schema.sql`).
