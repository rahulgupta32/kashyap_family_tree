# Supplied Stitch design applied to native Flutter

The owner's ZIP contains 32 PNG/HTML references, including alternate versions of the same screen. The premium home dashboard, premium calendar, refined tree and Modern Heritage design notes guide the shared visual system.

Implemented in the existing application:

- Cream paper backgrounds, saffron actions, peach selection, fine borders, framed portraits and bundled Inter/Playfair Display/Devanagari fonts.
- Native mobile/email entry and OTP verification, keeping the existing request, verification, cooldown and session code.
- Home/Tree/Calendar/Community/Profile navigation. Existing governed drawer destinations remain available.
- API-backed dashboard greeting, family/directory strip, calendar cards, authorized official notice, cultural content and messaging entry.
- Compact tree nodes, ancestor/descendant filters, zoom/fit controls and accessible list mode.
- Centered member and memorial profiles, account/privacy settings, secure photo display and email linking.
- Responsive calendar month cells, event cards, community cards, notification treatments and aligned chat bubbles.

The five PNGs are captures of actual Flutter widgets, rendered by `test/heritage_ui_test.dart` with explicitly synthetic fixtures. They are visual previews, not evidence of a deployed backend, verified cultural calculations, real members or physical-phone login. Member portraits use placeholders until an authorized photo is available. Reference names, statistics and family relationships are not seeded into the app.

Validation: clean Flutter analysis; existing authentication, claims, branch/governance, calendar, messaging and session regression tests plus four new layout/data-isolation tests. Generate visual captures with:

```sh
CI=true BOT=true flutter test test/heritage_ui_test.dart \
  --dart-define=UI_SNAPSHOT_DIR=/tmp/kashyap-ui-rendered
```

The live API connectivity issue reported on the earlier APK remains separate. This checkpoint changes the native UI; it does not claim a working staging-connected APK or production approval.
