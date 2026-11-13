# Native ordinary event composition

## Scope and requirements

Native members can compose `GENERAL_EVENT` or `COMMUNITY_MEETING` events with a title, optional details and optional venue, and read those approved details from the permission-filtered event response. Existing source date/time, reminder and genealogy-derived audience controls remain in place. The form explains that the chosen event audience can see its details and venue. Ordinary type labels are bilingual.

This advances CAL-FR-004 ordinary event creation/management, CAL-FR-003 and INV-FR-002 bounded detail display, with CAL-FR-011/INV-FR-011 privacy-context protection. Versioned edits use the existing revision/notice pipeline relevant to CAL-FR-012/INV-FR-009; this batch does not establish new notification/provider acceptance. Frozen requirements are in `docs/baseline/extracted_text/Kashyap_Adhikari_Master_Requirements_SDLC_Specification.txt` and are unchanged.

## Contracts and recovery behavior

Client validation matches the existing backend trimmed UTF-16 string limits: title 1–255, optional description at most 10,000 and optional venue at most 255. Request strings are trimmed, and empty optional strings normalize to `''`. The actual backend field allowlist accepts these fields. No end time is exposed: legacy TypeScript declarations mention endTime, but the accepted runtime request allowlist does not.

Ordinary updates send exactly `{version,title,description,location}` to the existing authenticated PATCH route. No date, event type, audience scope, branch, recipient, preview or reminder fields are sent, so the server retains those authoritative values and its current organizer/scope/version checks. Other event categories retain the existing title-only edit. Cancel preserves its separate version/reason contract with local reason validation. No cultural rule or calendar-source activation occurs.

Edits submit while the dialog remains mounted, with duplicate-submit and busy field guards. Successful responses close the dialog and reload the authorized list. A server edit failure retains text in the open dialog and displays a generic error. Further edit/cancel actions for that event remain blocked until an explicit authorized list reload; no version is silently replaced and no mutation retries automatically. The explicit button says “Discard draft and reload.” Draft retention is memory only while the dialog is open, and explicit close/reload discards it. Session replacement clears the new controllers synchronously, removes their exact dialog route and suppresses late follow-up reads/results.

## Verification and limits

Sixteen dedicated mocked widget cases in `apps/mobile/test/calendar_composition_test.dart` cover selected ordinary create type and exact content fields, default type/empty normalization, UTF-16 validation before requests, exact versioned update without visibility/date mutation, optional clearing, 409/403 draft retention and explicit reload, invitee detail/type rendering without organizer controls, legacy category compatibility, duplicate same-frame create/edit submits, dismissed-dialog callbacks, close-without-reload blocking, session invalidation and late success suppression. Existing session tests change only title field selectors because creation now has additional fields. No assertions are removed.

Local source/diff review and `git diff --check` pass. Flutter/Dart remain unavailable locally, so analysis and actual widget results are pending published-source CI. No executed edge-case acceptance is claimed before that evidence exists. EC-0201/0257/0258/0259 and EC-0191/0200 are relevant candidates supported by these precise test assertions only within this ordinary native workflow; the frozen case ledger is unchanged.

Device-local date selection followed by UTC serialization does not establish explicit Nepal-zone entry acceptance. Create lost-ack/manual-retry duplication remains an existing idempotency gap. Family/cultural composition, card/media/map fields, date editing, individual recipient composition, signed calendar references, providers/devices and NFR acceptance remain open. This additive evidence does not close full CAL/INV acceptance or authorize merge/deployment.
