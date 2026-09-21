# Application status

Updated 2026-09-21. Owner: Jyphra Technology Pvt. Ltd.

- M1–M3 are the preserved foundation. M4 PR [#4](https://github.com/rahulgupta32/kashyap_family_tree/pull/4) remains open against `develop`.
- M4 checkpoint `8bfe0fbb943523fb351d2c73db0651d48c61b88e` passed [PR CI 35514467567](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567), including a real Android emulator/live API/PostgreSQL flow and live ClamAV scanning. See `MILESTONE_4_DELIVERY_REPORT.md` for counts, commands and artifacts.
- Completion work continues in draft PR [#5](https://github.com/rahulgupta32/kashyap_family_tree/pull/5), stacked on M4. The community persistence checkpoint `2c3cba954ea25782718a6885cbee0c7f0aa17599` passed [push CI 35514808157](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514808157): 107 unit, 169 PostgreSQL integration, 14 browser and 20 Flutter widget/HTTP tests, plus typechecks and builds.
- Neither PR has been merged. No production deployment has been performed.

## Completion scope

| Area | Current evidence / next work |
|---|---|
| Genealogy, claims, governed edits, profiles, calendar | M4 automated and Android acceptance passed; extend remaining mobile forms and audit UI |
| Community | Persistent authenticated web/mobile posts, independent moderation, comments, reactions and reporting; CI passed |
| Chat | Database-backed membership, messages, read receipts, blocking and authenticated WebSocket transport implemented in web/mobile; new integration, browser and mocked mobile checks awaiting remote CI |
| Household map | Local implementation now uses persisted proposals, consent withdrawal, independent review and generalized coordinates. PostgreSQL, browser and device acceptance still pending |
| Dashboard and audit | Local dashboard now queries scoped counts; audit screen reads durable metadata. Remote HTTP/browser acceptance remains pending |
| Import and offline operation | Remaining implementation and acceptance work; not declared complete |
| Media and notifications | M4 private media and scanner verified; storage deployment, provider integration and remaining product surfaces still require work |
| Operations and release | Production credentials, cultural approvals, TLS, monitoring, backup/restore rehearsal and deployment acceptance remain gates |

This status does not equate build success, mock tests or a green subset of CI with full application completion. New commits must link their own acceptance evidence. User D: storage, backups and unrelated workloads remain preserved.

## Current verification checkpoint

The earlier approval-review usage block cleared on 2026-09-21. The normal non-forced update published chat commit `a279f204bc0f2b61d8787ac8ca5a255266d9b9ff` to the completion branch. The map/dashboard/audit changes are preserved in local recovery commit `64a0912` and included in this subsequent checkpoint. New PostgreSQL, browser and Flutter checks require their own completed CI results before acceptance can be marked passed.

The frozen master specification contains 229 functional requirements and 31 nonfunctional requirements. `RELEASE_ACCEPTANCE_LEDGER.csv` preserves all 260 requirements and acceptance text. These rows remain mandatory; module-level passing tests do not silently close requirements that have not been reconciled individually.
