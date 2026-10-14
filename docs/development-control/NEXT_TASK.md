# Next bounded task

Active task: durable native failed-push-opt-out reconciliation, IMPLEMENTED; exact-source CI VERIFICATION PENDING.

Acceptance criteria:

1. Persist pending removal with the existing secure native access/refresh record before DELETE when storage is available; retain intent through same-family refresh and process restoration.
2. Resume retries DELETE before GET/permission/token acquisition. Require a confirmed success response and secure-record acknowledgement to clear intent. Storage failure still attempts safe server removal, retains in-memory intent and reports no confirmed durability.
3. Explicit successful opt-in with confirmed PUT/secure write may supersede pending removal. Pending APNs, failed/unconfirmed PUT or write failure must not erase it. Old-session HTTP/storage completions and logout cannot alter replacement credentials.
4. Preserve legacy saved-session compatibility, private/provider payload policies, shutdown ordering and existing frozen/security controls. Add meaningful mock race/restart cases; disclose that physical process-kill/provider/secure-storage acceptance remains OPEN.

Immediate next action: inspect automatic CI for the current actual branch HEAD; require clean Flutter analysis, all 13 new tests and the updated existing failure/retry case. Inspect platform/native results and retained failures. Fix demonstrated failures only; append source SHA/tree/run IDs/actual conclusions to PR #5. Stop this batch after the recoverable handoff.

Following batch candidate (after current verification closes): audit native member calendar/event self-service against the frozen behavior and existing API/mobile routes, select one demonstrated missing action with current permission/privacy enforcement and bounded acceptance criteria. First inspect committed source to avoid duplicating existing implementations. External live-provider/signing/physical-device gates must not be replaced with mock evidence.
