# Native durable failed-opt-out reconciliation

## Bounded change

A failed push-registration DELETE previously stopped the current SDK but a process restart could GET the surviving registration and activate it again. Native sessions now retain a boolean `pushRemovalPending` inside the existing secure credential record. The boolean contains no provider token, notification content, account locator or diagnostic. Existing two-field records remain compatible; invalid marker types fail closed through normal session clearing.

Session rotation preserves the marker. Writes share the existing serialized secure-session queue; generation checks before and after writes fence replacement sign-in/logout. Replacement native activation and session clearing reset the marker. Bearer-only injected sessions have no restorable credential record and retain only in-memory intent, without overwriting secure storage with an invalid token pair. Production sign-in/restoration uses the native access/refresh credential record.

Disable stops callbacks, drains pending registration writes, persists intent before the idempotent authenticated DELETE and requires `{success:true}` before attempting durable acknowledgement. Storage failure still permits safe server removal to reduce unwanted delivery; it leaves the in-memory intent until both server acknowledgement and a later storage write confirm the result. If secure storage never accepts the first marker and the process dies, restart durability cannot be claimed; the operation reports unconfirmed removal. Previously queued provider notifications are not recalled by a registration DELETE.

Foreground/startup reconciliation retries pending removal before GET/permission/token activation, without requesting permission. SDK shutdown remains ordered after pending provider work. Late HTTP/storage results cannot update a replacement native session. Automatic retry is one idempotent attempt per reconciliation trigger with the existing HTTP timeouts, not a polling/background loop.

Explicit opt-in may supersede unresolved removal. The marker clears only after a confirmed PUT registration with an ID and a successful secure-record write. Failed PUT, unconfirmed acknowledgement, pending APNs acquisition or write failure retain the marker; process restart without the in-memory explicit opt-in safely returns to removal reconciliation. Existing application/provider/native signing/dependency/privacy policies remain intact.

## Focused validation

Added 13 mock-source/secure-store/mock-HTTP regressions covering durable intent before HTTP, restart and refreshed credentials, malformed/unconfirmed DELETE/PUT responses, 401 refresh preservation, write failures and fixed diagnostics, safe removal while storage is unavailable, explicit re-enable/APNs waits, old-session HTTP/storage completions, logout and legacy-record compatibility. The existing lifecycle failure regression now requires foreground deletion retry and retained SDK shutdown instead of permanent abandonment.

Local release assessment/workbook/whitespace validation passed; all 260 requirements, 31 exact frozen NFR targets, 14 workbook sheets/195 columns and OPEN approval gates remain preserved. Flutter/Dart are unavailable locally. Automatic source-bound Flutter tests/analysis and platform/native workflows must be checked independently; running/missing conclusions remain PENDING.

## Prior batch closure and release limits

Actual recovery HEAD `b7ec666cbd1aae9262dd1bb38d1f42619237671f`, tree `c28c3adbcb50ce96024d8dbbdaeba18d0abf293f`, passed PR CI 38470234155 (all six jobs), PR iOS 38470234134, push CI 38470226640 and push iOS 38470226429. Source-bound closure evidence is in PR #5 comment 6167764383. Prior `b515d597...` iOS push run 38469789349 failed test-launch; PR run 38469796673 passed the driver but failed test-evidence collection. Neither failure is relabelled. No speculative native fix or manual rerun was made.

This work supplies bounded local reconciliation, not live provider/physical-device acceptance. Physical secure-storage/process-kill/OS-denial, configured FCM/APNs/in-flight delivery, supported-device/bilingual accessibility/security/load, monitoring/incident ownership and all authority/import/DR/staging/release gates remain OPEN. No merge/deployment. Stop after the source-bound validation handoff; do not start another feature in this batch.
