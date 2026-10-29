# Android SDK archive recovery — 29 October 2026

## Demonstrated failure

Source b7cfd82a732706d1c520e9b78cfa021ff3848bbf/tree56f786f75064da0ea40cd3d3a81d54b8a8552475; CI40909410269. Initial Android123572961607 failed before emulator boot with Android Emulator `ZipFile unknown archive`. Authorized one-job retry123582958720 (attempt2, same run/source) failed before boot with the same error for Google APIs Intel x86_64 system image. Cleanup's adb5554 connection-refused message is secondary; no app or deletion assertion ran in either job. Other five jobs passed and were not manually rerun.

Both used ubuntu24.04 image20261025.353.1 and reactivecircus/android-emulator-runner commit a421e43855164a8197daf9d8d40fe71c6996bb0d. Its SDK installer invokes sdkmanager for stable emulator and system-images;android-35;google_apis;x86_64, redirecting installation stdout to/dev/null. No SDK/AVD actions/cache is configured here. Failed archives' bytes and resolved revisions were not retained; do not claim that cache corruption, a particular server response, or SDK version incompatibility has been proven.

## Independent official-source diagnostics

Google metadata and full archives were retrieved over HTTPS from dl.google.com, not an alternate mirror. On2026-10-29T16:40–16:41Z, full downloaded length/published SHA1/ZIP CRC checks passed locally:

| Stable archive | Bytes | Published SHA1 | Independently recorded SHA256 |
|---|---:|---|---|
| emulator-linux_x64-16428233.zip |349654171|cd7362ea55dfb86a418958138dc396e74165dd01|b08fc43d8608d2955f607f1b287beb525041e730086bdca3af152accac3af9c1|
| sys-img/google_apis/x86_64-35_r09.zip |1738815903|0103e6dab21290c4b9d16550a3ce99476f884eef|c67b9ba0ff5bc0eb6d046871bfa228af14d4d47b02f0cdae94f048e511b7566e|

Metadata: https://dl.google.com/android/repository/repository2-3.xml and https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-3.xml. Complete valid upstream copies now exist; this does not prove what the failed runners downloaded. No SDK binaries/archives are committed.

## Focused infrastructure correction

Add a preflight before the existing emulator action, using the same official sdkmanager/channel0/components. Retain version and verbose install logs plus cache size/prefix/sample hashes/ZIP-directory diagnostics. Require matching installed package.xml and nonempty emulator/system.img. Allow one retry ONLY for recognized archive/checksum errors, clearing only transient SDK download caches; preserve installed components. Other failures/timeouts fail immediately. SDK user preferences/cache live under this disposable runner's temporary directory. Fail closed if package/file validation is absent or SDK installer still reports corruption.

API35,Google APIs,x86_64,Pixel7Pro,KVM/Gradle settings,application source,test assertions and deadlines are unchanged. No general full workflow retry, disabled checksum, alternate SDK source or mocked acceptance. Existing android-* artifact paths retain new logs/JSON. The preflight explicitly does NOT claim independent full-archive checksum verification inside CI; sdkmanager remains the installer. Four local controls cover bounded retry,preservation of installed files,non-archive failure and rejection of partial/wrong metadata. These are infrastructure controls, not Android app evidence.

## Acceptance boundary

Account deletion and the generated260-row matrix still require actual successful emulator execution on the resulting source. No requirements or RG gates close from a successful SDK preparation alone. iOS40909410539 passed on b7cfd82; bind any subsequent native result to its own SHA. All production/signing/physical-device/provider/privacy/retention/UAT gates remain OPEN; no merge/deploy/real-data import/cultural activation.
