# Native calendar session isolation and navigation

## Demonstrated defects and frozen requirements

The native event list exposed period and all-event browsing only inside the event-create dialog, despite the existing browsing report describing a toolbar entrypoint. CAL-FR-010 in `docs/baseline/extracted_text/Kashyap_Adhikari_Master_Requirements_SDLC_Specification.txt` requires mobile day/month/agenda navigation. Both existing read-only routes now open directly from the calendar app bar without creating or submitting an event.

The event list, all-event browser and period view retained already-loaded permission-filtered event details after replacement authentication. Their callbacks could initiate later reads or mutations using the replacement credentials. The audience picker guarded some in-flight responses by bearer text but retained a resolved recipient preview and could return it after a session change. Annual recurrence watched only the account subject, retaining state after a replacement login for the same subject. CAL-FR-011 requires that unauthorized events are not disclosed. INV-FR-003/004/005/011 require privacy-safe recipient selection, accurate previews and invitation visibility. EC-0117 requires suspending actions when organizer authority is lost; this client guard does not replace that server-side authorization.

## Implemented scope and acceptance criteria

A shared calendar route guard binds the API service identity and existing session generation at route creation, and subscribes to the service's synchronous session-change Listenable. Replacement sign-in, restoration boundaries, logout and service replacement invalidate the route; ordinary access-token rotation within the same refresh family preserves it. Terminal invalidation clears loaded records, recipient names, pending audience confirmation, private recurrence evidence, editable source/filter state, pagination, errors and busy state, and displays a bilingual reopen message. No new polling is used.

Every async request continuation and action checks the bound session before rendering data, issuing a follow-up request or returning an audience selection. Existing create/edit/cancel dialogs are removed by their exact route, preserving other routes. Stale captured dialog callbacks cannot pop another route or submit a mutation. Concurrent list, browse and period reads carry epochs so older responses cannot overwrite newer results. The existing service request generation checks remain the transport fence; server authentication and current authorization remain authoritative.

Acceptance for this batch is: ordinary view/browse navigation is reachable without creation; loaded or late private calendar state cannot survive session replacement; stale mutation/RSVP/preview callbacks cannot send or return data in a replacement session; service replacement fails closed; same-account/same-bearer replacement still expires; same-session credential rotation remains usable; new screen instances remain the explicit recovery path.

Fifteen new mocked Flutter widget regressions in `apps/mobile/test/calendar_session_test.dart` cover those paths, including exact browse cursor protection, pending period response, create/edit cleanup, RSVP follow-up suppression and same-family rotation. Existing calendar management, audience and recurrence widget tests remain unchanged and must continue to pass.

## Verification boundary

Source/diff review and `git diff --check` completed locally. Flutter/Dart are unavailable in this workspace; Flutter analysis and widget test execution must be verified by GitHub CI at the published SHA. This report does not claim those pending checks have passed, nor native provider/device, signed calendar references, cultural-rule activation, load/accessibility/security acceptance or a production release. Frozen requirements and assessment ledgers remain unchanged. No merge or deployment is authorized by this batch.
