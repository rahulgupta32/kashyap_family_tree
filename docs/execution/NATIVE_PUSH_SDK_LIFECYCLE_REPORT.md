# Native push SDK lifecycle batch

This batch connects FlutterFire Firebase Messaging to the existing authenticated push-registration API. The frozen requirements and acceptance decisions remain unchanged.

## Behavior

- Android and iOS disable Firebase Messaging auto initialization in native metadata. Firebase initialization in Dart requires four approved public app identifiers supplied at build time and an authenticated session; missing configuration leaves the SDK untouched. Firebase's runtime auto-init setting persists across launches after a previous opt-in, so signed-out network behavior after abnormal process termination still requires device verification.
- A new native session does not prompt for notification permission or register by itself. The member explicitly enables device notifications in the notification inbox. A returning session resumes an existing server registration without another prompt if OS permission remains granted.
- The client checks OS permission, waits for APNs on iOS before requesting an FCM token, and registers the token under the server-authorized session family. It listens for token rotation and checks the current permission/session generation before each update. Foreground resume reconciles registration and permission withdrawal. Explicit disable removes the server registration and stops SDK auto initialization. Logout stops the SDK before the existing server logout revokes its session family.
- Errors in the opt-in UI are fixed messages without provider token content. Push payload handling does not assume private content from a provider; members continue to open their authenticated notification inbox.

## Verification and limits

Six pure Dart lifecycle tests cover fresh-session non-registration, opt-in and token rotation, delayed token/session replacement, permission withdrawal, account-switch fencing, and delete-after-in-flight-rotation ordering. They use a fake provider and mock HTTP; they are not physical delivery tests. Local XML parsing and whitespace validation pass. This workspace has no Flutter or macOS toolchain. Flutter analysis/tests and Android/iOS native builds require exact-head CI. Adding the plugin changes CocoaPods dependencies; commit the regenerated `ios/Podfile.lock` from a reviewed macOS build, while retaining the existing native-source hash gate.

Firebase's current Flutter guide calls `getToken` and token-refresh registration deprecated in favor of Firebase Installation IDs. The server adapter currently addresses FCM registration tokens, so changing to FIDs alone would break delivery; plan an atomic client/server migration. Firebase also requires iOS Push Notifications and remote notification capabilities, valid provisioning, an uploaded APNs key, matching approved app identifiers, Android channel/notification presentation review, and actual-device receipt/tap/background checks. None is satisfied by this SDK source alone. No 260-edge-case or production acceptance gate is closed; PR #5 remains draft and no merge/deployment is implied.
