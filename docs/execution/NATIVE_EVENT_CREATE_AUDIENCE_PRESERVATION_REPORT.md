# Native event creation audience preservation

## Demonstrated defect and correction

The ordinary-event form set its selected audience to null after a create request failed, after its preview expired, or when a replacement picker returned null. Null selects COMMUNITY on the next submission. Thus a network/server failure or cancelled navigation could silently broaden a previously private draft.

The form now retains the selected preview after failed writes and cancelled pickers. An expired preview remains visibly selected and prevents every save until the member explicitly chooses a new preview or clears the audience. Only a successful non-null picker result replaces an audience. The existing explicit clear action remains available. Creation errors use a generic Nepali/English label rather than untrusted server messages or transport diagnostics. No backend authorization, recipient filtering, consumption, cultural/date rule or visibility policy is weakened.

Advances CAL-FR-004 and CAL-FR-011, INV-FR-011 within native ordinary composition. This additive correction does not close those whole requirements or the frozen case ledger.

## Verification

Five widget regressions in calendar_create_privacy_test.dart exercise the real audience preview/picker for403,409 and network errors, checking both explicit retry requests retain identical INVITED_ONLY selection/preview and sensitive diagnostics are absent; cancelled replacement picker retains the prior preview; a preview expired between route return and save blocks two attempts, then only explicit clear produces COMMUNITY. The expiry fixture injects an expired picker-return value to model that timing boundary; it is not provider or real-clock/device acceptance.

Prior composition source941c56ea Fast38603176427 passed clean analysis and218tests; these results do not verify the five new cases. Local frozen matrix/workbook and whitespace validation must pass before publication. New-source analysis/widget/full/native checks are pending until executed and inspected. No mock result establishes live provider/security/UAT/release approval.

## Remaining recovery work

Community create can still duplicate after an ambiguous lost response and manual retry. An invitation preview consumed by a successful server write may then fail a retry. This correction preserves visibility; it does not add backend idempotency or durable retry identity. NEXT_TASK retains the transaction/account/payload/concurrency/delivery/native privacy acceptance criteria for that separate change. No server scope or expired preview is bypassed to force a retry.
