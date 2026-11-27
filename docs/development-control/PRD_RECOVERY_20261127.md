# 27 November PRD recovery checkpoint

The standalone PRD and implementation plan prioritize one ceremony journey across three fictional generations. Preserve the frozen release gates and record additions through Jyphra change control.

| Requirement | Current engineering focus | Evidence and next dependency |
|---|---|---|
| CAL 01 | Open the calendar grid at the current Nepal month and identify today | Gregorian fallback uses the existing period API. BS-first aligned grid, paired dates, observances and Tithi require an approved versioned calendar source, supported range, and review fixtures. |
| ID 01–04, FAM 01 | OTP-to-profile, exact-Person invitation and mutual parent–child acceptance | Existing claims and governed corrections are the integration points. Confirm field ownership and legacy DOB handling. Add two-sided acceptance with transactional identity, branch, conflict and graph checks. Pending matches confer no access. |
| FAM 02–03 | Directional kinship catalogue and memorials | Workbook v0.2 lists 71 provisional terms and requires independent reviewer and final approver. Keep the neutral fallback until the matching fixtures, rules and effective dates are approved. Memorial notifications need separately approved dates and ritual rules. |
| EVT 01–03, FAM 04 | Ceremony audience, two distinct alerts, RSVP updates and coordination | Preserve canonical event identity and current audience. Obtain Nepal-time reminder timing, quiet hours and the same-day policy from the owner. Validate independent push receipt and current authorization on both phones. |
| PRO 01–02, PILOT 01 | Connected profile and photo triage | Use the exact signed artifact, fictional identities and image, staging revision and sanitized request correlation IDs. Verify email OTP, reviewer MFA, workers, scanner and private storage before closing the reported failures. |

Finish pilot and production acceptance in the existing ledgers. The first physical-device journey is verified tree assembly, ceremony publication, announcement and Nepal event-day reminder, RSVP and eligible chat. An outsider must receive neither private event information nor a private notification.

## Owner decisions

- CAL 01 uses [Hamro Patro Bhadra 2083](https://www.hamropatro.com/calendar/2083/5) as the reference for calendar review. Confirm an authorized data feed, its coverage and version before ingesting its content into the production calendar.
- FAM 01 covers father and child registration in either order. Same-name ambiguity goes to review. A pending match grants no genealogy access.
- FAM 02 and LIFE 04 support independent review and activation for distinct Nepali cultural traditions. Approval for one tradition does not activate rules for another.
- Retain the documented event-day reminder, quiet-hours, same-day and default-family-audience policy. No new timing or audience defaults were selected.
- PRO 02 uses direct photo crop manipulation. Drag the frame to move it and drag a corner to resize it. The upload retains the existing normalized server crop contract.

## Native calendar and Reels navigation

The offline Flutter table is generated from the existing repository calendar table and epoch in `packages/localization/src/calendar.ts`. Regenerate it with `python3 scripts/generate-bs-calendar.py`. Supported conversion is BS 2000–2090. The AD value represents a civil date in Nepal, distinct from the backend's UTC instant at Nepal midnight. 1 Bhadra 2083 maps to Monday, 17 August 2026 in the backend table and the selected external reference. The existing table differs from the independently inspected upstream calendar in 2062 and 2084–2087. Those differences require review before widening factual accuracy claims. No public Tithi, festival or holiday dataset has been approved for import.

The earlier signed Android artifact from `d36baa0`, Main CI 45551346237, had a blank `KASHYAP_PREVIEW_REELS_ENABLED` value. The builder emitted a false Flutter define and navigation replaced Reels with Calendar. The dedicated tab now remains visible independently of the optional Community filter. Service admission, storage, audience and media validation remain on the existing server paths. An empty feed is distinct from sign-in/service errors, and failed requests offer retry.

Private selected-day agenda loads source-specific BS and AD periods through the existing authorization service and deduplicates by event ID. BS-stored events supply grid indicators. Existing event management receives the selected civil AD date as the picker default when it is eligible. Full BS-source creation, approved observances, exhaustive date validation and the two-alert ceremony journey remain release acceptance work.

## Signed Android screenshot review

Reviewed the standalone PRD, implementation plan and six connected-app screenshots. The screenshots do not identify their APK digest, runtime settings, device OS or API revision.

| Screen | Observed | Acceptance still needed |
|---|---|---|
| Home | Calendar is left of Notifications and all five bottom tabs are present. The account sees no accessible events, verified connections or notices. | Use a linked fictional member to verify authorized data and distinguish empty notices from an unavailable service. |
| Tree | The unlinked account sees a search prompt and no results. | ID 01–04 and FAM 01 require onboarding, exact-Person invitations, a governed review path and mutual matching in both signup orders. An empty visible directory grants no authority to expose more people. |
| Reels | The tab is visible. The feed reports unavailable and displays Community chrome and an upload control. | Use a verified fictional member, the deployed API flags and private media to distinguish access denial from feature availability and transport errors. Verify actual playback and revocation. |
| Profile | An unlinked account can display personal fields while the header does not identify the person. | Implement required self-reported full name and private DOB independently of canonical Person linking. Verify persistence and visible claim status. |
| Profile privacy | A photo chooser and public scope labels appear. | Verify saved photo through a restart and inspect authorized cross-account reads of fields. A displayed scope alone is no evidence of an exposure or of its default. |
| Community | The API rejects unverified membership, and the app displays the exception and posting controls. | The client now explains membership and hides creation on feed denial. Verify independent moderation with the authorized reviewer and the regular feed with a verified member. |

The client distinguishes verified-membership denial, expired sign-in, disabled Reels, retryable load errors and successful empty feeds. Its dedicated Reels screen no longer uses the Community heading. Home surfaces the existing Messages route before the Family calendar. Server admission, audiences and moderation continue to apply.

### Next acceptance sequence

1. Use two allowlisted fictional accounts, one verified and one unlinked, on the same signed build. Record the APK digest, API revision and flags, device OS and sanitized response categories.
2. Implement and accept ID 01 and LIFE 01 before automated matching. Check required complete BS/AD date validation, source preservation and private DOB. Follow with ID 02–04 and FAM 01, including same-name review and pending matches that confer no access.
3. Verify the three-generation ceremony journey and the two distinct Nepal-time alerts, current audience, private RSVP counts and event-to-chat authorization. Approved observances, cultural rules and source accuracy remain tracked separately.
4. Complete MSG 01, COM 01 and MED 01 with familiar conversation history and retry, chronological post paging and filtering, and private vertical Reel playback. Verify native calling, reconnect and access revocation on physical devices before enabling it. New interaction scope requires the existing product process.
