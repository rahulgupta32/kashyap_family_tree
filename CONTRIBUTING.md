# Contributing to Kashyap Adhikari Family Tree

## Ownership

This project is owned and managed by **Jyphra Technology Pvt. Ltd.** All contributions are subject to Jyphra's approval and intellectual property policies.

## Development Process

### Prerequisites

1. **Windows development machine** with all heavy storage on `D:\`
2. Git configured with conventional commit support
3. Development tools installed to `D:\Jyphra\dev-tools\`
4. All caches and build outputs configured on `D:\`

### Getting Started

```bash
# Clone the repository
git clone https://github.com/rahulgupta32/kashyap_family_tree.git D:\Jyphra\kashyap_family_tree

# Follow the developer setup guide
# See docs/guides/DEVELOPER_SETUP.md
```

### Branch Strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production-ready code | Protected, requires review |
| `develop` | Integration branch | Protected, requires CI pass |
| `feature/*` | New feature development | Developer branch |
| `bugfix/*` | Bug fixes | Developer branch |
| `hotfix/*` | Critical production fixes | Fast-track review |
| `release/*` | Release preparation | Protected |

### Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Scopes**: `auth`, `profile`, `genealogy`, `chat`, `events`, `admin`, `api`, `mobile`, `web`, `infra`, `docs`, `ci`

**Examples**:
```
feat(auth): implement OTP-based phone authentication
fix(genealogy): correct Nata/Saino computation for cross-branch relationships
docs(api): update OpenAPI contract for claims endpoint
test(edge-case): add EC-AUTH-007 concurrent session handling test
```

### Pull Request Process

1. Create a feature branch from `develop`
2. Implement changes with tests
3. Ensure all CI checks pass
4. Create a PR with:
   - Referenced requirement IDs (e.g., `REQ-AUTH-001`)
   - Edge case coverage (e.g., `EC-AUTH-007`)
   - Migration/rollback notes if applicable
   - Security/privacy impact assessment
   - Test evidence (screenshots, logs)
   - Remaining gates or blockers
5. Request review from designated reviewers
6. Address review feedback
7. Merge after approval

### Code Quality Standards

- All code must pass linting and formatting checks
- Type safety enforced (Dart strict mode, TypeScript strict)
- Minimum 80% unit test coverage for business logic
- All edge cases must have automated or documented manual test coverage
- Security controls must be tested
- Localization strings must be provided in both Nepali and English

### Testing Requirements

- Unit tests for all business logic
- Integration tests for API endpoints
- Contract tests for API compatibility
- Security tests for authentication/authorization
- Accessibility tests for UI components
- Localization tests for bilingual content
- Edge case tests traced to requirement IDs
- Performance tests for critical paths

## Reporting Issues

Use GitHub Issues with appropriate labels:
- `bug` - Something isn't working
- `security` - Security vulnerability (use SECURITY.md for sensitive reports)
- `enhancement` - New feature request
- `documentation` - Documentation improvements
- `gate` - Requires human/authority approval

## Code of Conduct

All contributors must maintain professional conduct and respect the cultural sensitivity of the Kashyap Adhikari community data and traditions represented in this application.

---

*Owner: Jyphra Technology Pvt. Ltd.*
