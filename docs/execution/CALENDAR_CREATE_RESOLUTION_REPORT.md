# Calendar create resolution and admin retry adoption

## Server contract and race safety

`POST /calendar/events/creation-resolution` requires the current authenticated active account and a UUID creationKey. The original payload may be included to verify its fingerprint for a committed result. A key-only request permits recovery after private draft loss; it reveals only the owned event ID, never an event body or recipient roster. Unknown properties are rejected. Original create payload mismatch rejection remains unchanged.

The resolver inserts an ABANDONED receipt in the same account/CREATE_EVENT/key namespace used by creation. If a create already committed, it returns CREATED plus the owned ID without changing/cancelling the event, revision, invitations, reminders or notices. If the resolver wins, the immutable terminal receipt prevents the delayed create from committing. Concurrent conflicts use at most three complete repeatable-read transactions with fresh snapshots and the existing five-second statement bound. An unconfirmed timeout/error remains unresolved in the client. Rollback removes the unused-key closure and its audit intent atomically.

Migration060 adds the abandoned flag, excludes an attached event on a closed key, and adapts the existing deferred result/immutability triggers. Finalized closed keys cannot reopen, mutate or be deleted. Downgrade refuses retained closures. A key-only unused-key close uses the empty payload digest; resolving that terminal no-event result remains safe with either key-only or full original intent. Create still rejects conflicting reuse. This is a permanent protocol record, not an expiring cache.

A new CALENDAR_CREATE_ABANDONED outbox intent records closure in the same transaction. It is audit-only: no calendar recipient snapshot or notification/reminder is generated, and the notification policy explicitly has a negative regression. Replaying resolution writes no duplicate intent. Existing account ownership, active/suspended checks and event visibility policies remain unchanged. Losing original branch membership does not prevent resolving one's own key; only an event ID can be returned.

## Native behavior

Recover/close is explicit in the failed create dialog and calendar toolbar. It sends the retained original identity/body, reuses native session/account fences and secure serialized persistence, and clears pending state only after a valid CREATED-with-ID or ABANDONED confirmation and durable cleanup. Lost/malformed/failed responses and cleanup failures retain identity. Durable cleanup now stays inside the credential-write queue and keeps the in-memory marker until the write succeeds, preventing a concurrent refresh from persisting credentials without an unconfirmed intent. A gated write/refresh regression covers this race. Recovered committed events are loaded normally; a closed unused attempt permits a new explicit draft/key. No client timeout or HTTP error alone discards an ambiguous operation.

## Admin behavior

Ordinary admin creation captures a UUID and immutable body after required audience previews. Synchronous submission guarding prevents same-frame duplicates. Same-account token rotation does not change the intent or rebuild its audience; retries send the same payload/key. Fields freeze after first submission. Account/authority changes clear private in-memory state and fence stale callbacks.

Before HTTP, per-tab session storage writes only owner/API/key metadata. Private title, description, invitation selections and rosters are not persisted there. Reload/navigation restores recovery-only state for the matching owner/server; a key-only explicit resolution is required before another draft. No empty draft is sent as a retry. Wrong owner/server or invalid key metadata cannot populate a form. Storage failure blocks HTTP; failed cleanup retains the in-memory key for recovery. Existing privacy and preview checks for a new create remain authoritative.

Limits: per-tab metadata does not survive tab closure or storage loss and is not cross-tab synchronization. A new explicit operation always has a new key; arbitrary unkeyed callers retain legacy behavior. Native physical storage/device/provider and production recovery acceptance remain open. Closing an already committed operation only recovers it; ordinary event cancellation remains a separate governed workflow.

## Validation

Local PASS: all439 API unit cases in46 suites; contracts compilation; API typecheck/compilation; admin TypeScript; frozen matrix/release/workbook validators; ten matrix negatives; five workbook cases; whitespace. Four Playwright cases list/parse successfully, which does not prove browser behavior. An intermediate test edit put a new resolution assertion into the older creation-only mock; moving it to the intended resolution fixture restored the final passing contract suite without weakening an assertion or production behavior.

Added five unit, four PostgreSQL, seven Flutter and four browser regressions: permanent closure, key-only/full recovery, account isolation/suspension, create-versus-close races, audit-intent rollback, immutable/downgrade evidence, no notification dispatch, lost/malformed acknowledgements, storage cleanup, stale account fencing, fresh draft/key after confirmation, same-body browser retry through token rotation, reload recovery, owner/server rejection and pre-send metadata failure.

New PostgreSQL/Flutter/browser execution is unverified locally because services/SDK are absent. Required exact-source automatic fast/full/native runs are recorded in PR #5 after publication. Parent119f987b1db22893a0c3356a637fac238c7db27b Fast38611278852 was independently SUCCESS: Flutter job116015089033 clean/all232 cases; full38611288843 and native38611288848 independently SUCCESS; inspected platform logs confirm434 unit/548 general integration/61 browser and successful fictional restore; all six CI jobs and native job passed. Earlier failures remain in CI_FAILURES. No result is inherited by this new source, no acceptance row closed, no merge/deployment.
