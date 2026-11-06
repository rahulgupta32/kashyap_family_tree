# Chat reporting and moderation checkpoint

Migration 022 persists one report per message/account. Reporting requires current verified conversation membership and a live message after the member's history boundary. Duplicate submissions preserve the original reason and resolution. Reports and audit intent commit together.

Central administrators and community moderators with global scope can review at most 100 recent reported records. Branch administrators and branch-scoped moderators cannot inspect private reports. Review discloses only the reported message, reason and case status; it provides neither surrounding conversation history nor sender/reporter identifiers. Reporter and message author cannot resolve their own cases. Resolutions require a note and are final for this checkpoint. Removal applies the existing message tombstone and is atomic with case resolution and audit intent.

Web and Flutter expose a bilingual report form with disclosure notice. Web reviewers can dismiss or remove; removal requires confirmation. The HTTP endpoints enforce authority independently of UI controls.

Local verification: API/admin typecheck, API/admin production builds, 139 API unit tests. Added real PostgreSQL cases for concurrency, foreign/restored history, independent review, audit rollback and tombstones; browser scenario for submission/reviewer self-resolution refusal; Flutter selected-message request test. Full CI remains pending until recorded for the published commit.

Remaining: attachments, case pagination/filtering, appeals, moderator assignment/escalation, reporter outcome notifications, retention policy, localization-wide acceptance, load/security/device review. Reports do not close the original 260-row final release acceptance ledger. No merge or deployment is authorized by this checkpoint.
