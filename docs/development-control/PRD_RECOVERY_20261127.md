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
