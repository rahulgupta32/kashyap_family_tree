# Required community post categories — 2026-10-05

COM-FR-001 requires missing-person notices, property/room availability, assistance requests and community programs alongside announcements. The API now accepts MISSING_PERSON, PROPERTY_ROOM, ASSISTANCE and COMMUNITY_PROGRAM on creation and author edits. Web and Flutter composers provide Nepali/English labels. Existing category values remain supported and existing posts are unchanged; no migration is required because category is a VARCHAR field.

All new posts and changed edits remain PENDING until independent moderation. Current verified membership, branch visibility, author identity, version checks and transactional revision/audit behavior still apply. Official ANNOUNCEMENT remains restricted to moderator authority. Category selection does not make content official or grant access to another branch.

Four PostgreSQL HTTP cases cover required-category creation, hidden pending content, foreign branch refusal and versioned author editing. The live browser community scenario now submits an assistance request and verifies its category after editing and independent publication. Existing native composer/edit widget coverage remains applicable; category-specific native device acceptance is not claimed. Local API/admin typechecks and unit tests are checked; exact-head CI evidence is recorded in PR #5.

This addresses the category gap in COM-FR-001 without closing signed release acceptance. Community/gallery media, private location/contact fields, configurable moderation, appeals/outcome notices and release-wide quality/provider/authority gates remain mandatory. No merge or deployment is performed.
