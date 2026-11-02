# Release candidate execution — 2 November 2026

Decision: **NO-GO for real-user release**. This is the current sprint blocker register; older sprint entries retain historical evidence only. Optional scope is frozen. All frozen mandatory requirements remain in scope.

## Source and recovery

Remote prerequisite `6d1c4d88577515ff5b5e27e06e30a04d07945864` was fetched, with PR5 draft/open/unmerged on its existing base. Recovery archive checksums, bundle prerequisites, patch application, parent, both file/blob hashes and `git fsck --full` passed. Original `a7ab3aedcc21ec18695df2210c4344ffd83919d6` was published with identical tree `7551ae9637cf8803fb35f29508cc8e32737abf36` as `1cf40450c805e959730a3b4c8d7f1cd295b72958`. Exact recovery manifest SHA256: `9f837a9089d6df41f85c149b1f2374d58d920f63a6dc24b365da2e9fa4de8a26`.

Main CI `41482097294` is source-bound to `1cf4045`. Platform, private S3, ClamAV and repository search jobs passed. Flutter job `125402804106` failed analysis at the recovered fixture's multiline unbraced GET; widgets were not run. Braces are corrected in this follow-on batch, preserving the fixture and original assertion. Android job `125402803115` FAILED after3passed/1failed: submissionStatus=403, resolutionStatus=403, responseMatchesIntent=false, pending=true. Source inspection demonstrated the challenger reused the earlier MFA authority phone ...0088, which that preceding test promotes to SUPER_ADMIN and enrolls. Follow-on uses ...0086 and asserts ordinary REGISTERED_USER role, ineligible/unenrolled MFA state before checking privacy. Existing MFA integration now explicitly requires MFA_REQUIRED/403 and zero receipt/closure writes for both dispute endpoints from an enrolled authority fresh OTP session. No MFA/visibility/receipt/acknowledgement assertion is relaxed. Exact-source device/integration rerun remains required. iOS `41482097285` was pending at preparation; final evidence must be checked separately. No old-source green result verifies changed Gradle/manifest or preview automation.

## Canonical release blockers, ordered by dependency

| Issue | Status / severity | Evidence | Accountable role | Next action |
|---|---|---|---|---|
| Authoritative native dispute recovery | OPEN, P0 core workflow | Diagnostic Android125402803115: both POSTs403; test reused enrolled MFA authority0088. Isolated ordinary challenger0086 + role/MFA guards prepared | Mobile/API/QA | Require all4actual Android journeys with real successful lost-response recovery; retain MFA403/no-write regression |
| Recovered widget fixture analysis | Correction prepared, P1 | `125402804106`, line24 curly-brace lint; tests skipped | Mobile/QA | Require clean analysis and complete exact-source widget run |
| Usable signed staging APK | BLOCKED, P1 | Only CI/emulator debug APK available; signed Preview pipeline prepared | Release engineer + Jyphra signing owner | Provision approved preview ID, certificate and private signing secrets; build, install and test staged login |
| Isolated staging stack | BLOCKED, P1 | Connected hosting inventory contains only unrelated `jyphra` and `mala-phenyle-chemical-works`; no Kashyap project | Jyphra infrastructure owner | Supply approved isolated target/access, domains, spending limit and operator for API/admin/PostgreSQL/Redis/private storage/scanner/workers/TLS |
| Mandatory workflow acceptance | OPEN, P1 | All260 final signed requirements remain open; three prior Android journeys are bounded evidence | Engineering + independent QA | Finish F1–F6 in existing completion sequence and verify actual staged journeys |
| Operational recovery and monitoring | OPEN, P1 | Disposable logical restore is not deployed PITR/RPO/RTO, alerting or rollback evidence | Operations | Deploy approved stack; rehearse migrations/rollback, backup/PITR restore, alerts and worker recovery |
| Security/privacy/accessibility/load/UAT | OPEN, P1 | Existing regression suites do not supply independent deployed acceptance | Named reviewers + Product Owner | Execute exact-candidate assurance and obtain actual decisions |
| Governed data/domain/providers/distribution | OPEN, P1 | No approved real import, cultural activation, live-provider or physical-device acceptance inferred | Respective named authorities | Retain gates; obtain signed inputs and independently verify each integration |

## Android artifact already available

[GitHub Actions artifact 13039818267](https://github.com/rahulgupta32/kashyap_family_tree/actions/runs/41193152176/artifacts/13039818267) contains `kashyap-m4-debug.apk`, version `1.0.0+1`, package `com.example.kashyap_mobile`, minimum Android API24 (Android7.0). Download requires applicable GitHub access. ZIP SHA256 `8bd4768132350863e6f2e7a45c33b512243ba12801e42d83a4f37e930799ce83` matches GitHub; APK SHA256 `41e0d474d74b94d1e3b8db9157a6560c3c368905abcc3158df80d66b33ce722d`. Binary AndroidManifest inspected independently.

Source is **6d1c4d8**, not this follow-on. Retained log proves build/install on Android15/API35 emulator and real OTP/claims/correction/chat/MFA/deletion journeys against disposable API/PostgreSQL/Redis. Dispute failed. The embedded `http://10.0.2.2:3010` endpoint is emulator-only and its hosted CI backend has ended. This APK is an engineering artifact, **not a working staging preview**, physical-device acceptance or signed internal distribution.

For emulator engineering use only: download/unzip, verify checksum, then `adb install -r kashyap-m4-debug.apk`. A correctly prepared synthetic local backend at emulator host port3010 is required for connectivity; no live staging credentials/accounts exist to hand over.

## Signed preview automation prepared

`scripts/build_internal_preview.py` and the reusable/manual `internal-preview.yml` build the actual Flutter release APK using an approved HTTPS staging origin, a separate `.preview` application ID and a visible Preview label. Existing default debug identity and production label remain unchanged. The existing release-signing guard remains active. No SMS, admin, server or database credentials belong in Dart defines.

The repository-level variable `KASHYAP_PREVIEW_APPROVED=true` enables the optional reusable CI job. Configure the `internal-preview` GitHub environment with approved variables `KASHYAP_PREVIEW_APPROVED`, `KASHYAP_STAGING_API_URL`, `KASHYAP_ANDROID_APPLICATION_ID`, `KASHYAP_PREVIEW_CERT_SHA256`; secrets `PREVIEW_KEYSTORE_BASE64`, `PREVIEW_STORE_PASSWORD`, `PREVIEW_KEY_ALIAS`, `PREVIEW_KEY_PASSWORD`. Apply owner-required environment protections. Do not send private keys/passwords through public PRs or logs. No environment or approval has been created by this batch.

The build verifies the APK certificate against the approved SHA256, checks actual package/minimum API using Android tools and emits checksum plus commit/tree/version/evidence JSON. Temporary signing bytes are removed on job exit. Artifacts expire after14days. Build output explicitly keeps installation/connectivity/production acceptance false. Staging test accounts must be provisioned privately with synthetic data and delivered through an approved secure channel after infrastructure exists.

Local admission tests reject absent approval, HTTP/local/placeholder/credential-bearing origins, wrong identity, absent keys, debug signing and absent certificate approval. YAML parsing,20 fast-planner regressions and3 frozen validators passed; shared build,API/admin typechecks and660 backend unit tests passed. **No local Flutter/Gradle/Android signed preview execution**: SDK and approved endpoint/keys absent. Exact-source CI must verify the changed Android manifest/Gradle path; signed preview still requires the external inputs above.

## Portable deployment packaging

Added multi-stage API/admin Dockerfiles, non-root runtime users, readiness/HTTP health checks, compiled production dependencies and Apache LICENSE/NOTICE. Build context excludes local credentials, native signing files, uploads and development data. API image includes the existing migration catalogue and still executes its coordinated bootstrap; no alternative migration implementation or production seeding was introduced. Admin requires an explicit HTTPS API build argument; the container CI uses an intentionally unreachable `.invalid` origin for isolated startup only.

The consolidated CI now builds both images and boots them against disposable PostgreSQL16/Redis7, checking non-root image configuration, real-PostgreSQL readiness after bootstrap and admin HTTP. Test mode is explicitly synthetic; this does not verify production settings, S3/scanner/live providers/TLS, staged browser connectivity, PITR or deployment. Local container execution is unavailable (no daemon). Locally, frozen pnpm production deployment and loading Nest/contracts/localization/test-fixtures/sharp/pg/ioredis succeeded; the packager emitted non-runtime dev-bin warnings. Image build/startup results remain PENDING until source-bound CI actually runs. No infrastructure provisioned or deployed.

## Acceptance and continuity

RG-01 OPEN; RG-02 OPEN; RG-03 OPEN; RG-04 OPEN; RG-05 OPEN; RG-06 OPEN; RG-07 OPEN; RG-08 OPEN; RG-09 OPEN; RG-10 OPEN; RG-11 OPEN; RG-12 OPEN. Required evidence/owners remain in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). No reviewer approval is inferred. Production GO requires their actual closure and Jyphra signoff.

No merge, real-data import, cultural activation or store submission. Staging deployment is requested but cannot execute without an explicitly approved infrastructure target and credentials. Continue independent engineering while these inputs are obtained. Final exact source/tree and subsequent CI conclusions belong in PR5's current checkpoint; do not create documentation-only CI loops.
