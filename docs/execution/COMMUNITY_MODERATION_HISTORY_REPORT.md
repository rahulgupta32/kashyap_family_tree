# Community moderation history checkpoint

Authors and currently scoped moderators can read recorded moderation decisions and linked appeals through GET /community/posts/:id/moderation-history. Web and native clients show decision reasons, appeal status/reasons and timestamps. Reviewer, author and reporter identities are omitted from the history response.

The API locks the post through authorization and selection, follows current membership and branch scope, hides unpublished posts from ordinary readers and returns no history for deleted posts. Retained decisions are not destroyed by post deletion. Version keyset pagination returns at most 50 records and a nullable nextBeforeVersion cursor; invalid or out-of-range cursors fail before persistence. Existing decision uniqueness supports the ordered query without a migration.

Coverage adds real PostgreSQL checks for resolved appeal history, author/moderator access, ordinary-reader and foreign-branch rejection, pagination, invalid cursors and retained deleted-post evidence. The browser scenario reads both publication decisions. A mocked Flutter HTTP widget case displays resolved appeal evidence and disables exhausted pagination; it does not constitute device acceptance.

Local API/admin type checks and 164 unit tests passed. Frozen assessment validation preserves all 260 requirements, 31 NFR targets and original acceptance fields. Exact published-head CI remains pending at publication and will be recorded in PR #5 when available.

This checkpoint does not reconstruct decisions predating durable decision storage. Deleted-post case management, report context/escalation, configurable moderation policies, community media, provider/device validation and signed requirement/NFR acceptance remain open. All frozen acceptance rows remain ACCEPTANCE_NOT_CLOSED; cultural gates remain closed. No merge or deployment is performed.
