# Member claim discovery, durable creation retry and correction

Owner: Jyphra Technology Pvt. Ltd. Status: source verification pending; no release acceptance closed.

## Behavior

- Authenticated `GET /claims/mine` selects only the current account, including reviewer accounts. It returns at most100 latest deterministic summaries (ID, target ID, status, revision, timestamps), with private/no-store headers and no evidence, phone, reviewer or correction-note payload. Query claimant filters cannot change ownership. The new authenticated mobile drawer lists these references and opens a fresh authorized detail read.
- Initial native claim creation records an immutable account/API-bound body and UUIDv4 retry key in the existing secure credential record before HTTP. Process restoration validates the envelope/body. Same-family credential rotation, push preferences and calendar writes preserve the claim intent; session replacement/logout clears it. Storage failure before send prevents HTTP. Lost responses, malformed acknowledgements and unconfirmed durable cleanup retain the same identity. Explicit recovery in My claims replays the original body, never a newly edited target. Bearer-only compatibility remains memory-scoped.
- A fresh authorized correction detail shows the original claimant a description/truth form. Submission includes the loaded revision. The API checks supplied revisions under its existing claim row lock, after ownership and before changes/audit. Stale/malformed revisions cannot mutate; descriptions, truth and metadata are validated. Evidence validation runs before mutation and existing evidence remains append-only. Legacy callers omitting a version remain compatible; they do not receive the new stale-revision guarantee.
- The mobile form synchronously blocks repeated submission. After uncertain mutation it retains a disabled private draft and requires an authoritative reload; failed reload retains that draft. Session/API/route replacement clears private controls and fences delayed responses/callbacks. New detail/collection reads suppress raw server diagnostics.

## Verification

Recovered source4c14f9e2576f48981d50af72adf278edb9e9529e: Fast39630696816/Main39630707317/iOS39630707354 independently SUCCESS. All six main jobs passed. Inspected Flutter119327866306 confirms260 tests passed; prior retry-test failure is closed for that source only.

Local new-source shared packages build, API/admin typechecks, API Nest build and all511 unit cases/51 suites PASS. First local unit attempt passed502 but could not load cookie-origin suite because the container lacked a direct Express dependency link; repaired only that local link to the installed pinned transitive package and reran the full suite successfully. No manifest/lockfile change. Frozen matrix/release/workbook validators and10 matrix/5 workbook regressions PASS. Whitespace check PASS.

New source adds service/version/input rejection and ownership unit coverage; real PostgreSQL/HTTP own-list isolation, concurrent correction serialization and later-cycle stale rejection; enhanced original-plus-appended evidence checks; mobile discovery/navigation/recovery/correction and secure restoration/storage/session tests. Flutter SDK, PostgreSQL and native runtimes are unavailable locally. Their automatic exact-source results remain PENDING until observed; test counts are not acceptance evidence.

## Remaining limits

This does not complete F1 or production readiness. The collection is explicitly latest100, with older-history pagination still open. Claim disputes, additional correction evidence UI, permanent-rejection resolution/abandonment, full account/profile/privacy/claim acceptance and approved evidence retention/collection rules remain open. There is no abandon control that could silently drop an uncertain create. Native durability uses existing platform secure credential storage; real devices and independent storage/privacy acceptance remain required. Existing HG gates, all260 final acceptance records and RG-01..12 stay OPEN. No merge, deployment or store submission.
