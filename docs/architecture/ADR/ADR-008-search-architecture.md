# ADR-008: Search Architecture (PostgreSQL Trigram & Full-Text)

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
Users must search family members by Nepali (Devanagari) name, English romanized name, branch/gotra, generation, location, birth year, and phone (for verified admins).

## Decision
Implement primary search using **PostgreSQL `pg_trgm` GIN indexes** with normalized Nepali/English phonetic transliteration mappings in the baseline phase, with an adapter boundary allowing OpenSearch/Meilisearch extraction if required at scale.

## Rationale
- Zero additional infrastructure complexity during Foundation and Core phases
- High performance for up to 1M+ Person records with proper composite GIN indexes
- Unified transaction boundaries without eventual consistency lags
