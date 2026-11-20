# Encrypted push credential restore witnesses

The guarded fictional PostgreSQL dump/restore rehearsal now seeds two encrypted push registrations: one live family and one explicitly ended family. Generated fixture keys remain only in memory and are never written into the database dump or JSON evidence. Existing schema/record manifests compare ciphertext, hashes, generation, ownership and expiration without emitting private credentials.

After actual restoration, the rehearsal decrypts both credentials with the retained fixture key and requires the original plaintext. Incorrect owner context and a missing managed key must fail with the fixed decryption diagnostic. It also requires generation-fenced invalidation to preserve the live registration, bounded retirement to remove only the ended family, and migration rollback to refuse a populated registry. Every result has a separate evidence field. Existing audit, genealogy, session-family, notification-claim, retry and recovery checks are preserved.

Local JavaScript syntax and schema canonicalization regression checks are available; PostgreSQL/docker are unavailable locally. Exact-head CI must execute this rehearsal before any successful recovery claim. This is not a production key-vault recovery procedure. `productionPushKeyRecoveryVerified`, production acceptance, PITR, measured production RPO and measured production RTO remain explicitly false.

Mandatory production work includes separately controlled secret backup/recovery, access and rotation controls, an approved production-like restore drill with operators, and verification of the frozen RPO/RTO targets. A database dump alone does not recover managed encryption keys or prove native push delivery.
