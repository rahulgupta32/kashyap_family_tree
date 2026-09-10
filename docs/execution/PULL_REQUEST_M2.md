## Milestone 2: Persistent Accounts, Authentication, Sessions, and Server-Enforced Permissions

### 1. Summary of Changes
- **Persistent Accounts & Identity Separation**: Implemented PostgreSQL-backed accounts (`user_accounts`, `user_roles`, `user_sessions`, `branches`) replacing all synthetic user generation and phone-suffix privileges. Enforced `BR-GOV-001` and `EC-0023` ensuring account creation strictly leaves `person_id = NULL` without auto-claiming or fabricating genealogy records.
- **Cryptographic OTP & Redis Persistence on D: Drive**: Implemented cryptographic 6-digit OTP generation with SHA-256 salting, 300s TTL, 60s resend cooldown (`AUTH-FR-004`), 5-attempt limit, and atomic consumption (`EC-0013`). Redis 7 configured with systemd drop-in sandboxing to store snapshots and logs strictly on D: drive ext4 storage (`/mnt/kashyap_pg/redis/`).
- **Multi-Device Sessions & Replay Detection**: Sessions persist in PostgreSQL with SHA-256 hashed refresh tokens. Refresh token rotation (`AUTH-FR-006`) invalidates used tokens. Replay attempts trigger immediate security escalation (`EC-0020`), revoking all active sessions across all devices for that user.
- **Server-Enforced Access Control**: Replaced client-side trust with NestJS guards (`JwtAuthGuard`, `RolesGuard`, `BranchGuard`). Prohibited self-elevation (`BR-GOV-004`, `EC-0230`) and enforced branch boundary isolation (`BR-GOV-005`).
- **SMS Provider Adapters & Production Gate HG-007**: Pluggable `SmsProvider` interface with `TestSmsProviderAdapter` for dev/test and `SparrowSmsProviderAdapter` enforcing production credentials gate `HG-007`.
- **Next.js Admin Portal (`apps/admin`)**: Bilingual (Nepali/English) OTP login flow with 60s cooldown timer, active role badge header, session persistence, and clear Access Denied screen for unapproved accounts.
- **CI/CD Integration**: Updated `.github/workflows/ci.yml` with native `redis:7-alpine` and `postgres:16-alpine` service containers.

### 2. Requirement & Edge-Case Traceability
- **AUTH-FR-001..012**: All 12 Authentication & Session Functional Requirements implemented and verified.
- **BR-GOV-001, BR-GOV-004, BR-GOV-005, BR-GOV-008**: Governance rules enforced server-side.
- **AUD-FR-001..005**: Tamper-evident immutable audit logging.
- **EC-0011..0023, EC-0225, EC-0230**: Edge cases covered by unit and integration tests.
- **HG-007**: Sparrow SMS production credential gate documented and enforced.

### 3. Verification Evidence
- `test:unit`: 12 test suites, 78 tests passing (100%).
- `test:integration`: 3 test suites, 26 tests passing (100%) against real PostgreSQL and Redis on D: storage.
- `pnpm run typecheck`: Passed with 0 errors across packages, services, and apps.
- `pnpm run build`: API and Next.js Admin portal compiled with 0 errors.

Detailed verification report: `docs/execution/MILESTONE_2_DELIVERY_REPORT.md`
