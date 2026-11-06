# Nepali Bansawali — API/mobile integration audit

This audit precedes deployment. Source baseline: `419e56bcd3357965f6dbaf60e48c4446de4d2f2c`; PR5 remains draft and unmerged. Production, paid infrastructure, real data and cultural-rule activation are outside this batch.

## Inventory and evidence interpretation

[Complete REST matrix (CSV)](api-mobile-matrix.csv), [machine-readable contracts/source/guards/dependencies (JSON)](api-mobile-matrix.json), and [readable route index](API_MOBILE_MATRIX.md) cover **260 method/path entries from26 controllers**, including compatibility aliases. This number is unrelated to the separately frozen260 functional/nonfunctional acceptance requirements.

The inventory uses the TypeScript compiler AST and type checker for decorators, request bindings, response types, controller/service calls and authorization annotations. It links Flutter methods, screen/direct request candidates and existing test files. Candidate matching is static, including known local chat path builders; conditional URLs, private API call chains and shared helper suffixes still require manual/runtime verification. No `working` status is inferred from a source reference, inferred TypeScript `any` or a discovered test. The matrix does not claim all260 routes were exercised by a device. Controller-level guards are supplemented by service actor, session, branch, ownership, recusal, cultural approval and SQL visibility checks; decorators alone do not establish authorization.

Baseline Main42253641126: platform/PostgreSQL, Flutter, storage/scanner/search and container jobs passed. Its Android job completed the existing four journeys but then failed building the additional USB APK: custom Gradle resource values were disabled. Baseline iOS42253640954 passed. These are baseline results, not verification of this changed source.

## Calendar contracts reviewed

| Workflow / existing route | Actual request and response | Mobile integration / limits |
|---|---|---|
| GET `/calendar/events` (also GET `/calendar`) | Optional `yearBs`, `monthBs`, `branchId`, `audienceScope`; `CalendarEventDetailDto[]` | Existing list; bounded latest100. Complete browsing uses the separate existing browse route. |
| GET `/calendar/browse` | Filters plus opaque decimal-string `before`; `{items,nextBefore}` | Existing native browser keeps bigint cursors as strings and replaces pages. No conversion of Gregorian events into BS filters. |
| GET `/calendar/period` | `source=AD|BS`, `view=DAY|MONTH|AGENDA`, original-calendar `date`, opaque `date|sequence` cursor | Native month/day/agenda; server returns period, numbered days/counts, undatedCount, items, nextBefore. BS2000–2090 validation uses the existing shared month table. AD grouping is Asia/Kathmandu. No BS weekday or Tithi conversion is invented. |
| POST `/calendar/events` (also POST `/calendar`) | `CreateCalendarEventDto`, account-bound `creationKey`; event detail | Existing durable mobile retry/recovery, explicit Nepal-time AD picker, ordinary event/meeting, invitation audience and reminders. BS/Tithi creation is not exposed as a calculated religious UI. |
| POST `/calendar/events/creation-resolution` | Original payload/key or owned key recovery; CREATED/eventId or ABANDONED | Existing immutable, process-restored retry identity. Unknown outcomes are not discarded as successful. |
| GET `/calendar/events/:id` | Fresh authorized event detail including `canManage`, lifecycle/version, own RSVP and permitted counts | **Connected:** list, browse and period entries now open a fresh detail route. Malformed/mismatched identities fail closed. |
| PATCH `/calendar/events/:id` | Current `version` and edited fields; updated detail | Existing guarded edit dialog reused from detail; Nepal minute input converts explicitly to UTC. Audience/type are preserved rather than rebuilt from UI defaults. |
| POST `/calendar/events/:id/cancel` | Current version and5–1000-character reason | Existing manager cancellation reused; reload authoritative state. Cancelled detail offers no RSVP controls. |
| GET `/calendar/events/:id/history` | Current manager authorization; latest100 revision rows | **Connected:** managers only; version/action/time rendered. Raw snapshots, actor IDs and audience evidence are not dumped into UI. Server remains authoritative on every read. No older-history pagination exists. |
| GET `/calendar/invitees`, POST `/calendar/events/preview` | Eligible accounts or branch/generation/descendant selection; account-bound expiring preview | Existing native audience picker. No phone-number directory or guessed genealogy-to-account mapping. Real PG tests cover stale previews, exclusions and scope. |
| POST `/calendar/events/:id/rsvp` | `response=GOING|MAYBE|DECLINED`, optional note; success/myRsvp | Existing list and new detail use real endpoint, then reload; optional RSVP note has no native editor. Unauthorized/cancelled behavior stays server-enforced. |
| `/calendar/recurrences...` | Proposed source event/version, explicit consent/evidence/leap-day policy; independently decided recurrence and preview | Existing native private annual reminders; this is not cultural recurrence or permission to activate Tithi rules. |
| Calendar notices/reminders | Transactional revisions, recipient snapshot and durable notification/audit intents; inbox read through `/notifications` | Existing worker/inbox path; test coverage includes cancellation, removed invitees, reminder dedupe and denial. Real push/SMS/email provider delivery remains external acceptance. |

The new Android calendar journey uses the real NestJS/PostgreSQL/Redis stack: native phone login, UI create, fresh detail/history, RSVP, UI update, unauthorized mutation/history denial, UI cancellation and denied late RSVP. It saves actual emulator login/calendar PNGs. Mocked widget captures are separately labelled synthetic and cannot establish live integration.

## Other reviewed modules and corrective work

| Module | Findings / correction | Remaining verification or incomplete surface |
|---|---|---|
| Phone/email auth, sessions | Existing transport, refresh rotation and logout retained. Added explicit confirmed global logout using existing `/auth/logout-all` with acknowledgement validation and session fencing. | Real email sender delivery, SMS/provider/physical-device and global-logout race acceptance remain unverified. Google is outside this batch. |
| Profiles/settings | Existing own profile/photo/privacy/policies/device controls mapped; display rename only. | Policy text/retention/consent authority and provider-specific push permissions are not granted by this audit. Dynamic profile helper routes and legacy `/me` aliases require row-level verification. |
| Genealogy/tree | Existing search/detail/tree API and explicit selection preserved; historical names/gotra untouched. | All relationship-edit/duplicate-merge/export endpoints are not automatically member UI requirements; administration remains in the authorized portal. Broad graph/privacy/load acceptance remains open. |
| Claims | Existing owner discovery/correction/resubmission/dispute flow retained. **Connected owner withdrawal** with confirmation, current server-state reload and no automatic retry after uncertain result. | Reviewer and appeal/recusal decision paths remain privileged web/API functions. Full lifecycle/race/device acceptance exceeds widget coverage. |
| Change proposals | **Connected own discovery/detail and edit correction/resubmission**; notification destination opens own requests instead of a new proposal picker. Added correct child/death request fields and session fencing to existing creation form. **Corrected server resubmission state/shape guard** to preserve terminal decisions and require a correction/conflict state. | Non-EDIT_PERSON correction editors remain incomplete; the screen explicitly directs coordination through administration rather than submitting an incorrect payload. The list API has no pagination. Current server-side ownership/recusal/MFA rules remain required. |
| Community | Existing posts/comments, replies, moderation, evidence/media and reports mapped. | Independent deployed moderation/retention/accessibility/media-delivery acceptance remains unverified. Some moderation functions are web/admin-only. |
| Messaging | Existing conversations, group/member actions, outbox retries, WebSocket connection, receipts and private attachments mapped. | Real network reconnection/fleet/provider testing, full attachment/device/branch/privacy acceptance remains open. WebSocket transport is `/chat/socket` upgrade protocol, not an extra REST route. |
| Notices/push | Existing authorized official notice/detail, inbox/read preferences, following and native push registration mapped; provider display name renamed. | FCM credentials, device permission/token rotation and actual notification delivery are not verified by mocks or renamed notification text. |
| Locations | Existing household consent/generalized location UI retained. | Cluster/map visualization and privileged review are not proven native flows; retain privacy/consent and precision restrictions. |
| Branch/admin/import/audit | Existing controlled admin routes and web portal retained; admin branding updated. | No automatic duplication of administrative endpoints into member UI. Branch authority, fresh MFA, independent approval, source/consent and import/operations gates remain open. |

## Rename boundary

Displayed name is **Nepali Bansawali — नेपाली वंशावली** in Flutter, Android default/Nepali resources, iOS display name, admin portal, email/SMS copy and FCM title. Preview and USB Test labels remain distinct. APK filenames identify the new name. `resValues` is explicitly enabled for generated preview/debug labels, fixing the observed Android failure.

Internal `com.example.kashyap_mobile`, Dart package/class names, platform channels, database identifiers, API paths, repository, registered SMS sender identity and existing MFA issuer `Kashyap` remain unchanged. Historic genealogy records, gotra/cultural content and baseline documents are not renamed. The generic tree illustration contains no old brand text.

## Validation and delivery boundary

Commands/results are recorded in [VALIDATION.md](VALIDATION.md). New-source real PostgreSQL/Redis, emulator calendar/USB and iOS outcomes must be observed from the exact published commit, not inferred from the baseline or source inventory. Renamed widget previews contain synthetic fixtures; actual emulator PNGs are retained only after the live test executes. The normal emulator APK embeds10.0.2.2:3010 and requires its host backend; it is not a persistent staging/physical-phone release. Its artifact contains exact SHA256/source/package/version/minimum API/signing/build-input evidence.

No infrastructure approval is needed for this isolated audit. Owner inputs remain necessary for cultural activation, real-provider credentials, real data/consent, independent acceptance, production signing and eventual deployment. No paid resources, production deployment or merge is performed.
