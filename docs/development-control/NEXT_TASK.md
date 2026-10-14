# Next execution

Current master milestone: full additive matrix/recovery/release controls, two-level CI, calendar private-state/session fences + toolbar views, and fail-closed production media signing key. Implemented; new exact-source CI verification PENDING. Read `CURRENT_STATE.md`, `CI_FAILURES.md` and source-bound PR #5 evidence.

Immediate verification acceptance:

1. Fast developer validation planner/integrity passes with every selected TypeScript/Flutter job. Never substitute fast checks for full release acceptance.
2. All six full CI jobs and native verification complete successfully at their actual source SHA; all15 new calendar +5 session-observer regressions and10 HMAC cases execute. Inspect failures/artifacts rather than rerunning full suites speculatively.
3. Matrix retains all260 exact requirement texts/31 NFR targets, independent260 frozen EC cases, supplemental inventory, original hashes and honest per-case/owner evidence limits; no signed acceptance or culture gate silently changes.

Next compatible bounded workflow milestone, after focused calendar checks pass: ordinary event details/composition.

- Native create exposes GENERAL_EVENT/COMMUNITY_MEETING only, with trimmed title1–255, optional description<=10000 and venue/location<=255 UTF-16 units, matching actual accepted backend fields.
- Render authorized description/location/type on the member event view; ordinary edit sends only `{version,title,description,location}`. Empty optional strings clear values; retain original date/calendar/provenance/reminders/audience/recipient history.
- Server conflict/authorization failures retain draft for correction and explicitly require reload for a new version; no blind retry/automatic version overwrite. Session replacement clears new controllers and blocks stale writes/results using the approved guard.
- Do not expose endsAt/endTime/startTime: these are not accepted by actual server allowed fields despite older DTO labels. Do not invent cultural/event-source conversion or approved ritual types.
- Files: `apps/mobile/lib/screens/calendar_events_screen.dart`, `apps/mobile/lib/localization/calendar_labels.dart`, dedicated calendar composition widget tests and feature report. Backend policy/version/audience behavior remains authoritative.

Broader dependency-aware completion is in `RELEASE_CHECKLIST.md` and per-row matrices. Controlled imports/promotion, missing client workflows, localization/accessibility/full load/security/production infrastructure and real owner/provider/device acceptance remain mandatory; this next scope does not remove them. Continue safe compatible milestones while slow CI runs independently, but prioritize a clean reviewed commit and exact recovery handoff before session limit. No merge/deployment/store submission without authorized completed gates.
