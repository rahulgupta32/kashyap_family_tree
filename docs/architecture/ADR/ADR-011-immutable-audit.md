# ADR-011: Append-Only Immutable Audit Persistence

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Source**: Master Requirements Specification §21

## Context
Genealogical dispute resolution, security forensics, GDPR/Nepal Privacy compliance, administrative actions, and data integrity verification require an unalterable trail of all state modifications.

## Decision
Implement an **append-only `audit_logs` table** with database-level `BEFORE UPDATE OR DELETE` rejection triggers, cryptographic hash chaining (`prev_record_hash`), and structured JSON payloads capturing `actor_id`, `actor_role`, `ip_address`, `user_agent`, `action`, `entity_type`, `entity_id`, `old_value`, and `new_value`.
