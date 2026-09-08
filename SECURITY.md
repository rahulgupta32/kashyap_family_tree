# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ (planned) |
| < 1.0   | ❌ Pre-release |

## Reporting a Vulnerability

**Do NOT report security vulnerabilities through public GitHub issues.**

### Reporting Process

1. **Email**: Send details to the Jyphra Technology security contact (to be designated).
2. **Include**:
   - Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
   - Full paths of source file(s) related to the vulnerability
   - Location of affected source code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact assessment and potential severity
3. **Response Time**: We aim to acknowledge receipt within 48 hours and provide a detailed response within 5 business days.

### What to Expect

- Confirmation of receipt and initial assessment timeline
- Regular updates on progress toward a fix
- Credit for responsible disclosure (if desired)
- Notification when the vulnerability is fixed

## Security Measures

This application implements the following security controls:

- Server-side least privilege and deny-by-default authorization
- Encryption in transit (TLS 1.2+) and at rest (AES-256)
- Secret manager integration (no hardcoded credentials)
- Input validation and safe output encoding
- Rate limiting and abuse protection
- Idempotency and concurrency controls
- Immutable audit logging
- Privacy-safe log practices
- Media/file malware validation
- Dependency scanning (SCA)
- Secret scanning in CI/CD
- Static Application Security Testing (SAST)
- Container image scanning
- DPIA compliance

## Scope

This policy applies to:
- The Kashyap Adhikari Family Tree mobile applications (Android, iOS)
- The administration portal
- All backend APIs and services
- Infrastructure and deployment configurations

## Out of Scope

- Third-party services and dependencies (report to respective vendors)
- Social engineering attacks against Jyphra staff
- Physical security of infrastructure

---

*Owner: Jyphra Technology Pvt. Ltd.*
