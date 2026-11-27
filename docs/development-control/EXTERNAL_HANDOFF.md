# Release authority handoff

Status: NOT READY. Jyphra Technology Pvt. Ltd. remains the release authority.

The complete operational preparation documents are provided privately to the project owner for review. This repository version records only release-gate ownership and acceptance; it does not contain a detailed production configuration inventory or deployment instructions. No public deployment, app-store submission or merge is authorized by this handoff.

| Workstream | Accountable role | Required accepted handback |
|---|---|---|
| Scope and critical journeys | Product Owner and QA Lead | Complete mandatory requirement and edge-case traceability with accepted UAT |
| Data and domain | Data Steward and Cultural Authorities | Approved source/consent/import reconciliation and signed domain reference behavior |
| Security and privacy | Security Lead and Privacy/Legal Authority | Independent accepted review and resolved mandatory findings |
| Reliability and operations | Operations Lead | Accepted production-like recovery, monitoring, incident ownership and rollback evidence |
| Mobile distribution | Release Lead | Approved signed artifacts and supported physical-device/provider acceptance |
| Executive release | Jyphra Release Authority | Signed go/no-go after all applicable frozen gates and reviews pass |

Every handback must identify its gate/requirement, accountable approver, exact candidate SHA, actual accepted evidence scope, outstanding failures and approval status. Draft procedures, available accounts, credentials or aggregate unit tests alone do not close a release gate. Use `RELEASE_CHECKLIST.md` and `REQUIREMENTS_MATRIX.md` for the full mandatory inventory.
