# Next bounded task

Status: SELECTED, implementation not started.

Native generic provider events → authenticated notification inbox.

Acceptance criteria:

1. Firebase background-tap (`onMessageOpenedApp`) and terminated-launch (`getInitialMessage`) signals open only the authenticated inbox; provider data/title/body/locators are neither rendered nor used for navigation.
2. Foreground events show one generic bilingual prompt with an inbox action; they do not interrupt the current route.
3. Session restoration and the existing authenticator gate precede navigation. Signed-out events, old-session delayed initial events, disposed bindings and stale foreground actions cannot navigate or access replacement credentials.
4. Repeated taps do not stack inbox routes. SDK errors remain fixed/silent and do not prevent ordinary app startup. No token, permission, dependency, simulator, provider-payload or backend policy changes.
5. Add focused mock-source/router/widget regressions, run available validators, then independently inspect automatic exact-source Flutter/native/platform CI. Live FCM/APNs/device acceptance stays OPEN.

After implementation: verify its automatic runs, investigate demonstrated failures only, update evidence, stop. Only in a later batch: durable failed-opt-out reconciliation (failed DELETE currently stops local SDK but is not retained across restart). Do not combine this with the routing batch.
