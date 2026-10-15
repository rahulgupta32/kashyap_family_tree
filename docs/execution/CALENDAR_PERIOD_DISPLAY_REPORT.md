# Calendar period and browse time display

Period and browse cards previously rendered raw UTC strings while ordinary creation and the main list used explicit Nepal UTC+05:45. Both cards now reuse `formatNepalInstant`; initial period date reuses `nepalWallClock`. This is a fixed-offset presentation change. Server-provided displayDate grouping and original BS/Tithi data remain authoritative, without historical-zone or cultural conversion claims.

Two new mocked-HTTP widget regressions exercise actual screens: UTC2026-12-31T18:25Z renders2027-01-01 00:10 with the Nepal offset, BS/Tithi labels remain unchanged, and period source query/grouping remain intact. Existing pagination/session regressions are retained. No contracts, persistence, permissions, invitations, notifications, reminders or retry identities changed.

Local executed: frozen matrix/release/workbook validators, ten negative matrix tests, five workbook regressions and git whitespace checks. Flutter/Dart absent: new widget/analyzer execution is pending automatic CI, expected245 tests. No backend unit/integration rerun locally for this Dart-only behavior. Parent6e5d3c3 has independently inspected454 unit/552 general integration/67 browser/243 Flutter successful main CI38722246676 and Fast38722239572.

Parent iOS38722246761 FAILED before tests: digest-verified artifact11967073861 (SHA256 a61af93510fff5635302a1fbbcba48cad5c2eae427d20c3b9645901e1e0ba78c) reports30s launch TIMEOUT with empty launcher output and no VM/body markers. Simulator/unsigned builds passed. This change does not claim to fix launch infrastructure. No speculative simulator/timeout edits or duplicate workflow runs.

Resolve this checkpoint SHA/tree and automatic runs from the source-bound PR #5 handoff. Actual device/live provider/security/accessibility/load/production recovery and all260 acceptance records remain open. No merge or deployment.
