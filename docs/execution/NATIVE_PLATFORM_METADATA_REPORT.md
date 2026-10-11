# Native platform metadata correction

The mobile sign-in client previously defaulted every OTP verification to `android`, including iOS. Default verification now derives `ios` from Flutter's current target platform while preserving explicit platform overrides and existing Android behavior. This complements the session refresh correction in the push registration batch: sign-in records the correct platform, and refresh retains it.

One new mocked native HTTP contract regression overrides Flutter's target to iOS and checks that sign-in sends `deviceInfo.platform: ios`. Existing Android/native session tests remain applicable. Flutter is unavailable in the local execution environment; analysis and this regression require exact-head CI before any pass claim. This test does not verify APNs permissions, iOS build/signing, device delivery, Keychain behavior or supported-device accessibility. Those release gates remain open.
