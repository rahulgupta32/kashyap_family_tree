# Android delivery checkpoint — 6 November 2026

Production remains NO-GO. No merge, production deployment, real data or cultural-rule activation is authorized by an engineering test result.

Baseline `8a783a4bd023b9e90ef5b57498f79275034c309e` contains email authentication and the owner's supplied heritage UI. GitHub Main42200598584 completed SUCCESS. iOS42200600640 failed in startup test line52 because it expected the previous visible title; simulator compilation and unsigned device compilation passed. This batch updates that visible assertion and retains Keychain, signed-out, bilingual, no-backend and no-Firebase checks. New-source iOS success is pending actual execution.

The owner-reported physical Android20-second timeout is still not independently reproduced on their phone. Prior CI APK build inputs use emulator-only10.0.2.2. This batch prepares a separately labelled debug `.usbtest` application with compiled loopback3010, exact source/build/checksum/signing evidence, readiness-first Windows connection helper and an actual Android loopback/session/profile/logout smoke test. See `docs/ui/USB_TEST.md`. New-source emulator execution, real physical-device login and real email/SMS delivery are separate acceptance items. No staging or production claim is inferred.

Deployment blockers:

- Backend: owner-approved provider/project and secure deployer/secret-store access are absent. Verify capacity for API/workers/PostgreSQL/Redis/private storage/scanner plus backups and HTTPS within the combined$20/month ceiling. Do not provision unapproved paid resources or assume a hard account spending cap.
- Vercel: existing Jyphra project inventory identifies team `jyphra-2457s-projects`; its team API returns403 and explicitly requires a team-specific app grant. Use Vercel's authorization link, then inspect the actual plan before creating only `kashyap-staging-admin`. Existing projects must remain untouched.
- Providers/signing: approved email sender/API credentials, staging SMS/test-provider policy, approved secret store and staging-only private signing certificate remain necessary. No secrets in chat or public source.
- Production gates: staged full-app functional acceptance, independent security/privacy/accessibility/Nepali review, required load evidence, monitored workers, backup/restore/rollback rehearsal, data consent/cultural authority and Jyphra release approval remain open. Aggregate CI is not signed acceptance of the frozen260 requirements.

Next executable milestone: obtain a source-bound USB test artifact and verify one physical-phone login against an isolated laptop backend, or deploy to the approved persistent staging target once access is available. Follow with real email delivery and all core application acceptance on that target. Google login and optional additions must not delay that delivery.
