# ADR-011: Append-Only Immutable Audit Persistence

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: AUD-FR-001..005, PRIV-FR-001..008, NFR-SEC-001..005

## 1. Context
Genealogical disputes, identity fraud investigations, administrator accountability, and Nepal Privacy Act compliance demand an unalterable, mathematically verifiable record of all system state changes.

## 2. Decision
Implement an **append-only `audit_logs` datastore** with:
1. Database-level `BEFORE UPDATE OR DELETE` rejection triggers preventing SQL modifications.
2. Cryptographic SHA-256 hash chaining (`prev_record_hash` -> `current_record_hash`), enabling cryptographic proof of log integrity.
3. Automated tamper-detection verification routines in the audit service.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **Standard Mutable Logging Table** | Vulnerable to SQL injection tampering or rogue administrator record modification. |
| **External Blockchain Network** | Excessive latency, gas fees, and public ledger privacy risks for genealogical metadata. |
| **File-Based Log Files (Logstash/Filebeat)** | Harder to query transactionally for in-app dispute resolution and audit trail UI. |

## 4. Consequences
- **Positive**: Absolute tamper-evident integrity; legally defensible evidence for dispute resolution; full audit coverage across all admin operations.
- **Negative**: Storage table grows monotonically (requires partitioned cold-storage archiving after statutory retention periods).

## 5. Security & Privacy Impact
- Even database superusers cannot modify existing audit records without triggering cryptographic integrity check alarms.

## 6. Scaling Impact
- Table partitioning by year (`audit_logs_y2026`, etc.) preserves high append performance and query efficiency.

## 7. Operational Impact
- Periodic automated integrity verification jobs run by background worker; alerts trigger if hash chaining is broken.
