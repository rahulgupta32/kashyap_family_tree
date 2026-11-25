# Connected pilot and Google Play handoff

Use PR #4 for its existing integration review and PR #5 for the stacked application changes. Keep separate or subsequent acceptance evidence tied to the exact artifact. The offline and USB builds use fictional fixtures. The signed core pilot uses a shared isolated HTTPS API and admin, Brevo, the server-side tester allowlist, and a staging-only signing identity. See [staging setup](../../infra/staging/README.md).

## First physical-device acceptance

Record Pass, Fail, or Blocked with source SHA, artifact digest, version, device model, OS version, and evidence. Record an emulator, simulator, and a handset as distinct environments.

1. Install the signed Android APK and provision the iPhone from the same reviewed commit and API origin. Confirm the gold tree icon, Calendar beside Notifications, and Reels navigation when private storage is ready.
2. On each device enter an invited mailbox. Expect a real Brevo message, reject an expired code, confirm resend and logout, and confirm the previous session cannot access member data. An uninvited mailbox receives no code and cannot establish a session.
3. As the fictional member, request a correction. Use a synthetic private attachment if storage is ready. As the separately provisioned reviewer, sign in by email, complete existing MFA, approve or reject within the assigned branch, and confirm the member UI and audit record. Check a reviewer from another branch cannot act.
4. Continue the [release checklist](RELEASE_CHECKLIST.md) and [acceptance ledger](../execution/RELEASE_ACCEPTANCE_LEDGER.csv). Cover account deletion, profile claims, disputes and resubmission, Community moderation, Calendar, messaging and membership, Nepali and English, and accessibility. For reels verify a normal five-minute recording, the duration and size boundaries, unauthorized access, and moderation removal. Keep live calls disabled in the core build until ready. For live-media acceptance record one-to-one and group calls, background ringing, reconnect, and confirmed rejection of a removed participant's previously issued credential.

## Before creating a production AAB

- Obtain the approved production application ID, monotonically increasing version code, upload signing configuration, API origin, and final authentication scope. Review Play Console account type and verification status, signing enrollment, track eligibility, and current target level. Google lists API 36 for new apps after the 2026 deadline. Inspect the built bundle manifest with bundletool because Gradle uses Flutter's target SDK default.
- Verify release build flags and packaged assets exclude pilot email-only controls, fictional fixture entry points, staging endpoints and credentials. Install the release candidate on supported devices and retain bundle digest and upload certificate fingerprint. Record monitoring ownership, tested recovery and rollback, and real-data approval.
- Prepare the listing with the approved app name, icon, feature graphic and production screenshots. Add the public HTTPS privacy and account-deletion URLs, support contact and reviewer access instructions using fictional least-privilege accounts through the approved review channel.
- Reconcile Data safety with actual release behavior and provider contracts. Audit account identifiers and OTP, profile and family records, user attachments and reels, messaging, enabled media and notifications, logs and telemetry. Confirm purposes, sharing, retention and deletion, and update declarations after comparing the signed candidate to the backend configuration.
- Review Play Console App content, including Data safety, privacy, account deletion, content rating, target audience, ads, and app access. Verify which account-specific testing prerequisites apply. Submit only after the pilot evidence, outstanding release gates and owner go-live approval are recorded.

Official references: [target SDK](https://support.google.com/googleplay/android-developer/answer/11926878), [user data and deletion](https://support.google.com/googleplay/android-developer/answer/10144311), [Play Console](https://play.google.com/console/).
