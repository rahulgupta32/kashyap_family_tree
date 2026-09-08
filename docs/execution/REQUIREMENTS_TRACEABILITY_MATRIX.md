# Requirements Traceability Matrix

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.  
**Version**: 1.0  
**Last Updated**: 2026-09-09

## Legend

- **Status**: ⬜ Not Started | 🔄 In Progress | ✅ Implemented | 🧪 Tested | 🚫 Blocked (gate)
- **Test**: Unit | Integration | E2E | Manual | Reference | Security | Performance | A11y

---

## Authentication & Session (AUTH-FR)

| Req ID | Description | Module | Screen(s) | API Endpoint(s) | DB Table(s) | Test Type | Status |
|--------|-------------|--------|-----------|-----------------|-------------|-----------|--------|
| AUTH-FR-001 | Registration with mobile number | auth | MOB-003 | POST /auth/otp/request | user_accounts | Unit, Integration, E2E | ⬜ |
| AUTH-FR-002 | OTP issuance via provider | auth | MOB-003 | POST /auth/otp/request | - | Unit, Integration | ⬜ |
| AUTH-FR-003 | OTP verification with expiry/attempts | auth | MOB-004 | POST /auth/otp/verify | user_sessions | Unit, Integration, E2E | ⬜ |
| AUTH-FR-004 | OTP resend with cooldown/abuse limits | auth | MOB-004 | POST /auth/otp/request | - | Unit, Integration, Security | ⬜ |
| AUTH-FR-005 | Secure session after verification | auth | - | POST /auth/otp/verify | user_sessions | Unit, Integration | ⬜ |
| AUTH-FR-006 | Session renewal without OTP | auth | - | POST /auth/refresh | user_sessions | Unit, Integration | ⬜ |
| AUTH-FR-007 | Logout current device | auth | MOB-040 | POST /auth/logout | user_sessions | Unit, Integration | ⬜ |
| AUTH-FR-008 | Logout all devices | auth | MOB-040 | POST /auth/logout-all | user_sessions | Unit, Integration, E2E | ⬜ |
| AUTH-FR-009 | Device metadata and push tokens | auth | MOB-040 | GET /me/sessions | devices | Unit, Integration | ⬜ |
| AUTH-FR-010 | Blocked account cannot authenticate | auth | MOB-003 | POST /auth/otp/verify | user_accounts | Unit, Integration, Security | ⬜ |
| AUTH-FR-011 | Security-relevant auth events audited | auth | - | - | audit_logs | Unit, Integration | ⬜ |
| AUTH-FR-012 | Admin MFA/stronger session controls | auth | ADM-UI-001 | POST /auth/otp/verify | user_sessions | Unit, Security | ⬜ |

## Profile, Preferences & Privacy (PROF-FR)

| Req ID | Description | Module | Screen(s) | API Endpoint(s) | DB Table(s) | Test Type | Status |
|--------|-------------|--------|-----------|-----------------|-------------|-----------|--------|
| PROF-FR-001 | Account/Person separation | profile | MOB-035 | GET /me | user_accounts, persons | Unit, Integration | ⬜ |
| PROF-FR-002 | Edit permitted profile fields | profile | MOB-036 | PATCH /me/profile | persons, person_names | Unit, Integration | ⬜ |
| PROF-FR-003 | Profile photo upload/crop | profile | MOB-036 | POST /media/uploads | media_assets | Unit, Integration | ⬜ |
| PROF-FR-004 | Extended profile fields | profile | MOB-036 | PATCH /me/profile | persons | Unit | ⬜ |
| PROF-FR-005 | Field-level visibility settings | profile | MOB-037 | GET/PUT /me/privacy | persons | Unit, Integration, Security | ⬜ |
| PROF-FR-006 | Language/notification/privacy prefs | profile | MOB-038,039 | GET/PUT /me/notification-preferences | notification_preferences | Unit | ⬜ |
| PROF-FR-007 | View/revoke sessions | profile | MOB-040 | GET/DELETE /me/sessions | user_sessions | Unit, Integration | ⬜ |
| PROF-FR-008 | Claim/verification state display | profile | MOB-035 | GET /me | profile_claims | Unit | ⬜ |
| PROF-FR-009 | Governed profile change history | profile | MOB-035 | - | genealogy_change_requests | Unit | ⬜ |
| PROF-FR-010 | Account deactivation/deletion request | profile | MOB-042 | - | user_accounts | Unit, Integration, E2E | ⬜ |
| PROF-FR-011 | Deletion de-links without erasing genealogy | profile | MOB-042 | - | user_accounts, persons | Unit, Integration | ⬜ |
| PROF-FR-012 | Minor restrictive privacy defaults | profile | - | - | persons | Unit, Integration | ⬜ |

## Genealogy Person & Family Tree (GEN-FR)

| Req ID | Description | Module | Screen(s) | API Endpoint(s) | DB Table(s) | Test Type | Status |
|--------|-------------|--------|-----------|-----------------|-------------|-----------|--------|
| GEN-FR-001 | Immutable unique Person ID | genealogy | - | - | persons | Unit | ⬜ |
| GEN-FR-002 | Living/deceased/child/non-user/historical | genealogy | MOB-011,012 | GET /people/:id | persons | Unit | ⬜ |
| GEN-FR-003 | Nepali/English name variants | genealogy | MOB-011 | - | person_names | Unit, Integration | ⬜ |
| GEN-FR-004 | Partial/unknown facts support | genealogy | MOB-011 | - | persons | Unit | ⬜ |
| GEN-FR-005 | Verified parent-child links | genealogy | MOB-010 | - | parent_links | Unit, Integration | ⬜ |
| GEN-FR-006 | Verified spouse links | genealogy | MOB-010 | - | spouse_links | Unit, Integration | ⬜ |
| GEN-FR-007 | Reject self-links | genealogy | - | - | parent_links, spouse_links | Unit | ⬜ |
| GEN-FR-008 | Detect/reject ancestry cycles | genealogy | - | - | parent_links | Unit, Integration | ⬜ |
| GEN-FR-009 | Navigable tree display | genealogy | MOB-010 | GET /people/:id/tree | persons, parent_links, spouse_links | Unit, Integration, E2E | ⬜ |
| GEN-FR-010 | Progressive expansion/lazy loading | genealogy | MOB-010 | GET /people/:id/tree | - | Performance | ⬜ |
| GEN-FR-011 | Branch/generation support | genealogy | MOB-010 | - | branches, persons | Unit | ⬜ |
| GEN-FR-012 | Cross-branch connections | genealogy | - | POST /admin/genealogy/links | parent_links, spouse_links | Unit, Integration | ⬜ |
| GEN-FR-013 | Source/provenance metadata | genealogy | - | - | persons | Unit | ⬜ |
| GEN-FR-014 | Death recording request | genealogy | MOB-016 | POST /genealogy/requests | genealogy_change_requests | Unit, Integration | ⬜ |
| GEN-FR-015 | Death triggers dependent workflows | genealogy | - | - | - | Integration, E2E | ⬜ |
| GEN-FR-016 | Admin direct Person edit with audit | genealogy | ADM-UI-009 | PATCH /admin/people/:id | persons, audit_logs | Unit, Integration | ⬜ |
| GEN-FR-017 | Archive rather than hard-delete | genealogy | - | - | persons | Unit | ⬜ |
| GEN-FR-018 | Export with privacy filtering | genealogy | - | - | - | Unit, Security | ⬜ |

*(Remaining modules follow the same structure — SRCH-FR, CLAIM-FR, CHG-FR, DUP-FR, REL-FR, CUL-FR, CAL-FR, JUT-FR, NOT-FR, INV-FR, COM-FR, MAP-FR, CHAT-FR, ADM-FR, AUD-FR, PRIV-FR, I18N-FR, MEDIA-FR, NFR-*)*

## Summary Statistics

| Module | Total Requirements | Implemented | Tested | Blocked |
|--------|-------------------|-------------|--------|---------|
| AUTH-FR | 12 | 0 | 0 | 0 |
| PROF-FR | 12 | 0 | 0 | 0 |
| GEN-FR | 18 | 0 | 0 | 0 |
| SRCH-FR | 8 | 0 | 0 | 0 |
| CLAIM-FR | 12 | 0 | 0 | 0 |
| CHG-FR | 15 | 0 | 0 | 0 |
| DUP-FR | 9 | 0 | 0 | 0 |
| REL-FR | 13 | 0 | 0 | 0 |
| CUL-FR | 10 | 0 | 0 | 0 |
| CAL-FR | 13 | 0 | 0 | 0 |
| JUT-FR | 9 | 0 | 0 | 0 |
| NOT-FR | 11 | 0 | 0 | 0 |
| INV-FR | 12 | 0 | 0 | 0 |
| COM-FR | 14 | 0 | 0 | 0 |
| MAP-FR | 7 | 0 | 0 | 0 |
| CHAT-FR | 14 | 0 | 0 | 0 |
| ADM-FR | 16 | 0 | 0 | 0 |
| AUD-FR | 5 | 0 | 0 | 0 |
| PRIV-FR | 8 | 0 | 0 | 0 |
| I18N-FR | 5 | 0 | 0 | 0 |
| MEDIA-FR | 6 | 0 | 0 | 0 |
| NFR-* | ~35 | 0 | 0 | 0 |
| **Total** | **~267** | **0** | **0** | **0** |

---

*This matrix will be updated as implementation progresses. Each requirement marked as implemented must have corresponding test evidence.*
