# Calendar invitation and reminder checkpoint

This checkpoint extends `feat/application-completion` from `c8ada12efe0278e933c24f167c23b0d4a1ed6407` with migration 019. It does not close the 260-row Release Acceptance Ledger.

## Implemented behavior

- Authenticated member search and all-or-nothing invitation preview exclude unavailable accounts and protected/private profiles. Branch selection requires current scope authority.
- Event creation saves invitations, a versioned revision, audit intent, notification recipient snapshots and future reminder jobs in one transaction.
- HTTP edits and cancellation require the current version. Concurrent stale edits fail with a conflict. Cancellation preserves revision history and cancels pending reminder jobs.
- Organizers see invitation IDs and attendance totals; attendees see their own response. Revoked invitations lose private-event access.
- A PostgreSQL worker locks events before reminders, skips locked events, emits reminder audit intents transactionally and never calls a delivery provider inside that transaction. Emitted jobs are not replayed. Failed transactions retain pending jobs.
- Inbox visibility, initial delivery and retries recheck the current event revision, lifecycle, recipient access and reminder RSVP. Category/channel notification preferences remain enforced.
- Web supports explicit AD scheduling, one-hour reminders, member invitation search/preview, title edits, cancellation and revision browsing. Flutter supports AD community-event creation, reminders, title edits, cancellation and RSVP. API supports up to three distinct offsets selected from 30/60/1440/10080 minutes.
- BS/Tithi metadata remains independent of organizer-entered Gregorian times. No conversion is invented; HG-004 remains closed. Month/year reads now filter before the result limit.

## Verification

Added date/category unit cases, isolated PostgreSQL/HTTP transaction, authorization, concurrent worker, rollback, revocation and cancellation tests, a browser organizer workflow, and Flutter organizer/attendee widget checks. Local TypeScript checks and 129 API unit tests pass. Database, browser, Flutter and live-device results must be taken from this checkpoint's own CI run.

CI exposed the legacy date constraint, Flutter HTTP argument names and dialog-controller disposal during closing animations. Corrections extend the constraint to explicit AD instants, retain existing Tithi validation compatibility, use the shared HTTP helper and keep controllers alive until their routes finish. Migration rollback refuses AD-only records rather than inventing BS dates.

## Requirement impact

| Requirement | Progress in this block | Still open |
|---|---|---|
| CAL-FR-002 | Source fields and provenance are refreshed with versioned snapshots | Full approved conversion/reference acceptance |
| CAL-FR-004 | Version-checked edit/cancel, history, organizer controls | Complete mobile editor and device acceptance |
| CAL-FR-010 | BS year/month filters apply before limiting | Day/month/agenda navigation and range pagination |
| CAL-FR-011 | Current access is checked in reads, invitations and reminders | Full family/ancestry audience policy |
| CAL-FR-012 | Committed changes/cancellations notify current explicit invitees according to policy | Relevant follower expansion and provider acceptance |
| NOT-FR-003 | Explicit AD event reminders use durable jobs | Derived verified family occurrences and approved recurrence |

These are progress annotations against the original assessment, not signed release acceptance.

## Remaining scope

Recurrence, ancestry/generation calendar audiences, a Flutter invitation picker, complete calendar editor fields, delivery-provider acceptance, approved BS/Tithi conversion, device matrix and full localization/accessibility acceptance remain open. Workers use the existing audit outbox/provider pipeline; creating a reminder is not evidence of production SMS/push/email receipt. The source assessment's 102/104/42/12 classification is still its original baseline, not a new completion percentage.

## Calendar creation control layout checkpoint

Relationship-staging CI 37970252666 passed database checks but timed out in the M4 calendar browser scenario after clicking Create Event while waiting for its title field. Retained trace shows a completed click, no dialog and concurrent refresh/reminder loads. Later unchanged-calendar CI 37970827451 passed the platform job. This intermittent result does not establish a deterministic root cause; async reminder layout above the creation control is a plausible contributor.

The calendar header/Create Event button now precedes the asynchronously growing recurrence panel, so late reminder rows cannot displace the control. The new browser regression holds recurrence responses, records the button position, releases twelve fictional rows, asserts unchanged vertical position, then opens/fills the dialog. Existing restoration/rotation and identity/authority guards remain in place. Local typecheck/test collection and exact-head CI are recorded separately in PR #5. This addresses control stability without claiming that every possible session/render race is resolved. No acceptance, merge or production deployment.


Calendar creation refresh-race checkpoint: branch/residence CI passed database tests and 41 browser cases but failed calendar management while waiting for the creation dialog. The trace retained the same account/roles across refresh and showed an event-list reload overlapping the click. The creation button was coupled to that list's loading flag, which can disable the control between pointer events. Creation now depends on restored account/session availability, not asynchronous event-list loading. A regression deliberately holds the event-list reload after same-account token rotation and verifies an enabled creation control, visible dialog and retained input. The earlier session-restoration and delayed-reminder layout checks remain. Actual new-head browser execution is required; no retries or origin/authorization protections are weakened.


Calendar private-state isolation checkpoint: account/authority changes now clear the full creation draft, dates, selections, loaded events, edit/history state, search/results, messages and operation flags before paint. Async list/invitation/history/RSVP/edit/create callbacks compare the initiating account, authority and token scope before updating UI. Same-account token rotation continues preserving the creation draft while invalidating previews. A browser regression signs in a second fictional account through the real OTP API, delivers its verified session through the cross-tab storage listener without reloading the page, and checks that a reopened creation form contains no prior-account title or late prior-account invitation-search result. Real browser execution remains required; server authorization is unchanged.
