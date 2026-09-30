# Application status

Updated 2026-09-30. Owner: Jyphra Technology Pvt. Ltd.

- M1–M3 are the preserved foundation. M4 PR [#4](https://github.com/rahulgupta32/kashyap_family_tree/pull/4) remains open against `develop`.
- M4 checkpoint `8bfe0fbb943523fb351d2c73db0651d48c61b88e` passed [PR CI 35514467567](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514467567), including a real Android emulator/live API/PostgreSQL flow and live ClamAV scanning. See `MILESTONE_4_DELIVERY_REPORT.md` for counts, commands and artifacts.
- Completion work continues in draft PR [#5](https://github.com/rahulgupta32/kashyap_family_tree/pull/5), stacked on M4. The community persistence checkpoint `2c3cba954ea25782718a6885cbee0c7f0aa17599` passed [push CI 35514808157](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35514808157): 107 unit, 169 PostgreSQL integration, 14 browser and 20 Flutter widget/HTTP tests, plus typechecks and builds.
- Neither PR has been merged. No production deployment has been performed.

## Completion scope

| Area | Current evidence / next work |
|---|---|
| Genealogy, claims, governed edits, profiles, calendar | M4 automated and Android acceptance passed; extend remaining mobile forms and audit UI |
| Community | Persistent authenticated web/mobile posts, independent moderation, comments, reactions and reporting; CI passed |
| Chat | Database-backed membership, messages, read receipts, blocking and authenticated WebSocket transport implemented in web/mobile; PostgreSQL/WebSocket and mocked mobile checks passed; browser acceptance under correction |
| Household map | Persisted proposals, consent withdrawal, independent review and generalized coordinates implemented. PostgreSQL tests passed; browser/device acceptance pending |
| Dashboard and audit | Dashboard queries scoped counts and audit reads durable metadata. HTTP integration passed; dashboard login redirect browser regression under correction |
| Import and offline operation | Remaining implementation and acceptance work; not declared complete |
| Media and notifications | Private media, inbox history, authorized follows, and mobile notice-to-search navigation are published. The offscreen Flutter Unfollow test correction at `c344b0e34ed6a57f2ad1ed0c3f54ed537238a592` passed [PR CI 36739095812](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36739095812). Broadcast checkpoint `e23d3005085aad2e31de9b0db7eda0b3c421165e` adds all-member/branch/generation preview and sending, recipient snapshots, transactional audit and a web composer; [PR CI 36743123612](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36743123612) passed its isolated PostgreSQL/browser checks and Flutter/ClamAV/Android jobs. Defined audiences, reminders, real provider credentials and their delivery acceptance remain open. |
| Operations and release | Production credentials, cultural approvals, TLS, monitoring, backup/restore rehearsal and deployment acceptance remain gates |

This status does not equate build success, mock tests or a green subset of CI with full application completion. New commits must link their own acceptance evidence. User D: storage, backups and unrelated workloads remain preserved.

## Current verification checkpoint

The complete M4 file tree was restored in commit `3ac8cdbe10a12b7be3a571c1a38dab58994c1a7b` after an earlier publishing error removed 351 files. The restoration preserves all 352 original paths and the device-test correction. PR #4 remains open; this repair is not a merge into `develop`.

M4 restoration commit `3ac8cdbe10a12b7be3a571c1a38dab58994c1a7b` retains all 352 paths; [PR CI 35630426019](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35630426019) and [push CI 35630421280](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/35630421280) passed. Completion commit `c29c4f8f1947fad22fc7538d5b4afdbffe9aba9b` retains all 392 paths; [PR CI 36032716021](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36032716021) passed all four jobs: 110 unit, 195 real PostgreSQL integration, 17 browser scenarios, Flutter analysis and widget tests, live ClamAV, and the Android emulator with live NestJS and PostgreSQL.

Completion follow commit `1d314f4f97b9ed88d3bdafa9355f444f287117c4` retains all 397 paths. [PR CI 36034989513](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36034989513) passed the platform (110 unit, 196 real PostgreSQL integration, 18 browser scenarios), Flutter and live ClamAV jobs. An earlier attempt `9d5de921ca9594028fb0188a2b6f341261aa70a3` failed one integration assertion because the suite correctly retained a prior follow event in inbox history. The assertion was corrected without clearing that history.

The latest published notice-navigation correction `c344b0e34ed6a57f2ad1ed0c3f54ed537238a592` retains all 398 paths. [PR CI 36739095812](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36739095812) completed successfully across all four jobs, including the Android emulator using a live NestJS/PostgreSQL backend. New broadcast changes are a separate implementation checkpoint; successful older CI does not verify them.

Broadcast checkpoint `e23d3005085aad2e31de9b0db7eda0b3c421165e` retains those 398 paths and adds seven files. [PR CI 36743123612](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36743123612) and [push CI 36743116126](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/36743116126) completed successfully. The PR run reports 110 backend unit tests, 198 real PostgreSQL integration tests in 21 suites (including `notification-broadcasts.integration.spec.ts`), 19 Playwright browser cases, 24 Flutter widget/HTTP tests, 0 Flutter analyzer issues, live ClamAV checks, and one Android emulator live API/PostgreSQL test. Android identifier `emulator-5554`, API base `http://10.0.2.2:3010`; the device log shows `00:54 +1: All tests passed!`. These results validate this checkpoint, not all 260 release requirements.

The frozen master specification contains 229 functional requirements and 31 nonfunctional requirements. `RELEASE_ACCEPTANCE_LEDGER.csv` preserves all 260 requirements and acceptance text. All remain mandatory. The application is still in implementation and acceptance; neither PR has been merged and no production release is claimed.
