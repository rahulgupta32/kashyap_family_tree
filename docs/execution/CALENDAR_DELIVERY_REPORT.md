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
