# Explicit Nepal-offset Gregorian event entry

## Demonstrated behavior and correction

Admin datetime-local input used new Date(value), and Flutter combined date/time in the device local zone before toUtc(). The same organizer-entered clock fields could therefore represent different stored instants on devices in different zones. Event cards also used browser-local or raw UTC output.

Entry now visibly states Nepal UTC+05:45. The TypeScript helper validates actual Gregorian fields/minute precision and subtracts345 minutes from UTC-backed wall fields. It does not parse the wall input using the host zone. Flutter constructs UTC-backed picker-field tuples and performs the same explicit subtraction, rejecting accidental device-local tuples. Picker today/tomorrow defaults derive from the Nepal wall clock. Both main lists display explicit-offset wall time; malformed/unspecified-zone instants get fixed unavailable feedback rather than echoed input.

Example:2027-01-02 00:10 at the selected offset submits2027-01-01T18:25:00.000Z in either New York or Tokyo. Organizer10:00 submits04:15Z. The captured UTC request/key stays unchanged on retry; no stored events are rewritten. API time validation, invitations, preview checks, privacy/session fencing, reminder scheduling and receipt resolution remain unchanged.

This is explicit numeric-offset organizer entry, not historical IANA timezone reconstruction or a BS/Tithi calendar conversion. Existing explicit API timestamps remain supported. Fixed offset is labelled, not inferred from the device or silently asserted as historical Nepal civil-time behavior. Full period/browse/detail formatting, time editing/end-time scope, cultural/source approvals and broader calendar acceptance remain separate work.

## Validation

Local PASS: localization compilation, all454 unit cases/47 suites, admin TypeScript, frozen matrix/release/workbook validators, ten matrix negatives, five workbook regressions and whitespace. Fifteen new TypeScript cases cover four host zones, midnight/year/leap-day boundaries, invalid or rolled-over fields, and labelled explicit-offset display. Four Flutter cases cover UTC-backed picker tuples, Nepal clock/default-date boundaries, instant display/unspecified-zone rejection and supported range/precision; existing actual composition-body assertions now require04:15Z for selected10:00.

Two new Playwright scenarios override browser zones to America/New_York and Asia/Tokyo and exercise the actual entry/HTTP payload/main-list display. All six tests in the affected browser file parse/list successfully, which is not execution. Flutter/browser/new-source native/full verification is unverified locally because SDK/database services are absent; exact-source automatic run IDs/statuses are recorded in PR #5 after publication. No new dependency or lock changed.

Recovered source94035936d12cddff23170a6bbf99225e010cc5e9 now has independently retrieved SUCCESS for Fast38614156198, CI38614164411 and iOS38614164428. Its prior inspected439 unit/552 general integration/65 browser/239 Flutter and fictional restore evidence remains bound to that source. It cannot verify this new implementation. All260 final acceptance records/release gates remain OPEN; no merge/deployment.
