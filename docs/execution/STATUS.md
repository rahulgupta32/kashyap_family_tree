# Application status

Updated 2026-09-20. Owner: Jyphra Technology Pvt. Ltd.

- M1–M3 are the preserved foundation. M4 PR [#4](https://github.com/rahulgupta32/kashyap_family_tree/pull/4) remains open against `develop`.
- M4 checkpoint `8bfe0fbb943523fb351d2c73db0651d48c61b88e` passed [PR CI 35514467567](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567), including a real Android emulator/live API/PostgreSQL flow and live ClamAV scanning. See `MILESTONE_4_DELIVERY_REPORT.md` for counts, commands and artifacts.
- Completion work continues in draft PR [#5](https://github.com/rahulgupta32/kashyap_family_tree/pull/5), stacked on M4. The community persistence checkpoint `2c3cba954ea25782718a6885cbee0c7f0aa17599` passed [push CI 35514808157](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514808157): 107 unit, 169 PostgreSQL integration, 14 browser and 20 Flutter widget/HTTP tests, plus typechecks and builds.
- Neither PR has been merged. No production deployment has been performed.

## Completion scope

| Area | Current evidence / next work |
|---|---|
| Genealogy, claims, governed edits, profiles, calendar | M4 automated and Android acceptance passed; extend remaining mobile forms and audit UI |
| Community | Persistent authenticated web/mobile posts, independent moderation, comments, reactions and reporting; CI passed |
| Chat | Replacing in-memory demo conversations with durable membership, messages, receipts and authenticated realtime transport |
| Household map | Demo data and caller-supplied verification flag still need replacement with database-backed privacy and consent |
| Import and offline operation | Remaining implementation and acceptance work; not declared complete |
| Media and notifications | M4 private media and scanner verified; storage deployment, provider integration and remaining product surfaces still require work |
| Operations and release | Production credentials, cultural approvals, TLS, monitoring, backup/restore rehearsal and deployment acceptance remain gates |

This status does not equate build success, mock tests or a green subset of CI with full application completion. New commits must link their own acceptance evidence. User D: storage, backups and unrelated workloads remain preserved.
