# Physical Android connection evaluation

The separate `com.example.kashyap_mobile.usbtest` debug app is labelled **Kashyap — USB Test** and compiles `API_BASE_URL=http://127.0.0.1:3010`. It can coexist with the prior app and approved `.preview` release. Release builds reject the USB flag. The normal signed preview still requires HTTPS and its approved private signing key.

This APK depends on a synthetic backend running on the connected laptop. It has no hosted backend, real-email acceptance or production approval. `adb reverse` forwards the phone's loopback port to the laptop; it does not expose database, Redis or email capture publicly.

Download the source-bound Android Actions artifact and extract `usb-test`. In Windows PowerShell, with a trusted USB-debugging phone connected and the isolated laptop API already ready on port3010:

```powershell
.\connect-usb-test.ps1 -Apk .\kashyap-usb-test-<commit>.apk
```

The helper checks the artifact checksum, exact embedded-origin manifest, laptop readiness and selected authorized device before installing. With more than one device, pass `-Serial <adb-serial>`. It does not uninstall an existing app or delete data. Retain the laptop process and cable throughout testing. Remove forwarding afterwards with `adb -s <serial> reverse --remove tcp:3010`.

If readiness fails, stop: this is a backend prerequisite, not an OTP-security defect. Use only an isolated synthetic database, Redis and approved development provider configuration. Do not run a test-OTP-enabled backend on a public interface or expose it through a tunnel. Phone requests follow the configured SMS provider; email requests require either an approved real sender or an isolated test capture controlled by the backend operator. This batch adds no public OTP-reader endpoint or code logging.

The new CI smoke test verifies loopback readiness, native phone OTP verification, secure session creation, profile read and logout on an Android emulator with `adb reverse`. It uses existing test-only SMS observation against the disposable CI backend. It does not prove physical-device acceptance or real SMS/email delivery. The artifact records source/tree, build command, package, minimum Android API, signature certificate and SHA256; physical/staging/production acceptance flags remain false.

Owner acceptance after the backend is available:

- Install the labelled USB Test app; verify the expected design and no20-second connection timeout.
- Request email OTP, obtain it only through the configured sender or private capture, verify login, load the expected synthetic account, logout and repeat.
- Verify existing mobile OTP through the authorized provider; expired/incorrect/replayed codes must fail.
- Search a synthetic member, navigate parents/spouse/children and open a profile.
- Submit a claim/change and verify the appropriate administrator's review; confirm another branch cannot act.
- Exercise community posts, messages, notices and notifications with two synthetic accounts.
- Confirm privileged admin MFA and logout/session revocation.

Persistent staging still needs an authorized backend project/deployer and secret store, Jyphra Vercel team/repository access, approved email sender, staging SMS/test-provider policy, HTTPS and private staging signing. No billable infrastructure or production deployment is created by this work.
