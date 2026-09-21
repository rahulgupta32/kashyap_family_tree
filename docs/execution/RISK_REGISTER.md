# Risk Register

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.

## Risk Matrix

| ID | Risk | Category | Likelihood | Impact | Mitigation | Owner | Status |
|----|------|----------|------------|--------|------------|-------|--------|
| R-001 | Cultural/religious rules not signed before development needs them | Domain | High | High | Implement as versioned config with disabled-by-default activation; continue all independent work | Community/Religious Rep | Open |
| R-002 | Incorrect genealogy data corruption | Data | Medium | Critical | Immutable audit, append-only history, atomic transactions, approval workflows, cycle detection | Engineering | Mitigated by design |
| R-003 | Privacy data exposure | Security | Medium | Critical | Server-side enforcement, field-level visibility, privacy tests, DPIA, pen testing | Security Lead | Mitigated by design |
| R-004 | Fraudulent identity claims | Security | Medium | High | Evidence requirements, verifier review, conflict detection, rate limiting, audit | Engineering | Mitigated by design |
| R-005 | Branch rule disagreements | Governance | Medium | Medium | Regional variant support, escalation to Super Admin, authority assignments | Governing Committee | Open |
| R-006 | iOS build/signing blocked by no Apple credentials | External | High | Medium | Cross-platform Flutter code, configure macOS CI path, defer signing to HG-007 | Jyphra | Accepted |
| R-007 | Docker Desktop on C: drive consumes space | Infrastructure | High | Medium | Gate: Docker must be configured on D: before large image pulls (HG-015) | DevOps | Open |
| R-008 | Irreplaceable genealogy data loss | Data | Low | Critical | Soft-deletes, append-only versions, automated backups, PITR, quarterly restore tests | Operations | Mitigated by design |
| R-009 | Nepal network latency/unreliability | Performance | High | Medium | Caching, compression, pagination, offline states, retry with backoff, CDN | Engineering | Mitigated by design |
| R-010 | OTP/SMS provider unreliability | External | Medium | High | Provider adapter pattern, fallback provider config, rate limiting, retry | Engineering | Mitigated by design |
| R-011 | D: drive space exhaustion | Infrastructure | Low | High | Space monitoring protocol, 20GB minimum threshold, pre/post operation checks | Engineering | Monitored |
| R-012 | GitHub `gh` CLI not authenticated | Development | High | Low | Use HTTPS git credentials for push; `gh` needed only for Issues/PRs API | Developer | Accepted |
| R-013 | Large-scale genealogy graph performance | Performance | Medium | High | Progressive loading, query optimization, caching, traversal depth limits | Engineering | Mitigated by design |
| R-014 | Concurrent genealogy edit conflicts | Data | Medium | Medium | Optimistic concurrency, version checks, atomic transactions | Engineering | Mitigated by design |
| R-015 | Nepal legal/regulatory compliance gaps | Legal | Medium | High | Implement configurable retention/consent, defer final policies to legal review (HG-006) | Legal Counsel | Open |
| R-016 | Production cloud provider not selected | Infrastructure | High | Medium | Use IaC with provider adapters; all code portable; defer cloud selection to HG-008 | Jyphra | Open |

## Risk Response Strategies

- **Avoid**: Eliminate the risk by changing the approach
- **Mitigate**: Reduce likelihood or impact through controls
- **Accept**: Acknowledge and monitor without additional action
- **Transfer**: Shift risk to a third party (insurance, vendor SLA)

---

*Last updated: 2026-09-09*
