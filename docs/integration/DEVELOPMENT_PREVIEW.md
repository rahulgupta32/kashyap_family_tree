# Development inspection builds

## Offline UI preview — implementation ready for native verification

This build uses a separate `lib/main_dev_preview.dart` entry point, debug-only `.devpreview` Android identity and visibly labelled synthetic data. The production entry does not import preview repositories. It installs no server token, sends no HTTP/WebSocket traffic and stores no credentials. Existing Flutter screens use an isolated in-memory transport and synthetic chat frames. Resets, persona changes and process restarts erase the sample changes. No result is real backend persistence or provider delivery.

Build from `apps/mobile`:

```sh
KASHYAP_DEV_PREVIEW=true flutter build apk --debug \
  --target=lib/main_dev_preview.dart --dart-define=ENABLE_DEV_PREVIEW=true
```

The independent **Offline development preview APK** workflow builds and uploads `nepali-bansawali-offline-preview.apk`, `evidence.json` and real release/profile rejection logs. Its evidence records exact commit/tree, APK SHA256, package, public debug signer digest and build inputs. Check the workflow and checksum before distribution. Build configuration alone is not installation acceptance.

Install with `adb install -r nepali-bansawali-offline-preview.apk`, or open that APK on an Android test phone and permit installation from the selected source. It is separate from the USB/staging/production apps. Tap **Enter Development Preview** without requesting OTP. The top switch-account button cycles Regular Member, New / Unclaimed Member, Branch Verifier, Branch Admin and Super Admin. The reset button erases in-memory changes; exit returns to login. The screen-catalog button opens implemented mobile surfaces.

Supported synthetic interactions include person/tree navigation, calendar creation/edit/cancel/RSVP/history, community posting/comments/likes, chat messages through memory frames and notification preference/read state. Unsupported uploads, provider delivery, cultural calculations, privileged decisions and recovery actions return an explicit full-stack requirement. Administration is a labelled role illustration, not a substitute for the real Next.js portal. Offline maps collect no GPS. These are preview limitations, not completed production features.

Android release/profile build tasks reject preview flags (even on the production target), preview target or preview identity before release signing. iOS runs the same non-debug exclusion policy before Flutter compilation. The preview entry also refuses non-debug execution or absent opt-in. Automated source-graph checks require production imports to exclude all synthetic files.

## Full-stack development testing — separate acceptance path

Use the existing isolated test API/PostgreSQL/Redis fixture workflow and real OTP-issued sessions, never a fake JWT or disabled guard. Ordinary email/mobile sign-in remains unchanged. The existing USB package uses `http://127.0.0.1:3010` and requires `adb reverse tcp:3010 tcp:3010` plus a ready laptop backend. Staging packages require an approved HTTPS origin, private signing and protected environment. Offline preview never falls back to those servers.

A direct five-persona full-stack entry and phone acceptance are not yet delivered by this offline build. Server authentication, MFA, branch isolation and audit must still be verified on the actual isolated stack. Real delivery providers, staging access, signing, physical devices and independent acceptance remain external gates.

## Evidence and tracker

Recovered baseline `d540e366e4df69a7e22a0d6cf48a46f72043d8c9`: Main42593651760 and iOS42593651763 both completed SUCCESS. This validates the preceding terminal guards/screenshot correction, not this preview source.

A detailed source-derived tracker was prepared locally. Its generated inventory publication is blocked by automatic review pending specific owner disclosure approval. The public17-screen inspection inventory is in PREVIEW_DELIVERY_20261110.md; it does not claim production completion. It complements, rather than replaces, the frozen requirement acceptance ledger. The integration inventory excludes synthetic preview sources from production API evidence.

Local preview suite covers opt-in/release policy, forbidden external transport, refused OTP access, deterministic reset/mutations, memory chat frames, dashboard entry/persona/exit and navigation through17 catalog surfaces. Native build, release rejection and screenshots remain pending until exact-source CI artifacts are inspected. A two-line Nepali family-card overflow exposed by these tests was corrected with text-scale-aware height.
