# ADR-005: Redis for Caching, Rate Limiting, and Ephemeral State

**Status**: Accepted (Baseline)  
**Date**: 2026-09-09  
**Decision Makers**: Jyphra Technology Pvt. Ltd.  
**Requirements References**: AUTH-FR-004, AUTH-FR-009, NOT-FR-001..011, NFR-PERF-001..005, NFR-SEC-004

## 1. Context
High-frequency security operations (OTP rate limiting, brute-force throttling, active JWT session registries, notification fanout, and rendered tree caching) require sub-millisecond in-memory response times.

## 2. Decision
Use **Redis 7+** as the central in-memory datastore, rate-limiting registry, distributed lock manager (Redlock), and BullMQ message queue broker.

## 3. Alternatives Considered
| Alternative | Evaluation & Rationale for Rejection |
|-------------|--------------------------------------|
| **In-Memory Node.js Cache (MemoryCache)** | Does not share state across multiple load-balanced API cluster nodes; lost on container restart. |
| **Memcached** | Lacks native data structures (Sets, Hashes, Sorted Sets), persistence (AOF/RDB), and message pub/sub capabilities. |
| **RabbitMQ / Kafka** | Overkill for Phase 1.0; Redis provides sufficient queuing throughput for notification fanouts and worker jobs. |

## 4. Consequences
- **Positive**: Sub-millisecond latency for OTP cooldown checks; automated TTL expiration; robust background job queueing with BullMQ.
- **Negative**: In-memory storage cost must be monitored; Redis persistence (AOF) configured to prevent data loss during container restarts.

## 5. Security & Privacy Impact
- Transient storage only; sensitive PII is never stored in unencrypted Redis keys without short TTLs.

## 6. Scaling Impact
- Offloads 85%+ of read queries for hot root genealogy nodes; handles up to 50,000 ops/sec per standard Redis instance.

## 7. Operational Impact
- Standardized container image with AOF persistence on D-drive storage (`D:\Jyphra\kashyap_family_tree_data\redis`).
