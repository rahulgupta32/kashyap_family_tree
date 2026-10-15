# Governed community comment removal

Authenticated DELETE /community/posts/:id/comments/:commentId requires only a bounded reason (5–1000 characters). The current visible post is locked before its comment. Removal requires the authenticated comment author or current moderator authority for that post branch; post ownership alone grants no authority over another author's comments. Foreign IDs, role/membership loss, hidden/deleted posts and forged/unexpected fields are refused. The paginated DTO exposes server-computed canRemove; API authorization is enforced independently of client controls.

Existing deleted_at implements logical removal without rewriting source content or deleting children. Both legacy and paginated reads/counts omit removed comments; paginated parent context omits removed parent text and replies remain. New replies to removed parents are refused. Retained cursor rows continue to define older-page boundaries. The post version and publication state are unchanged.

A reason, actor, post and AUTHOR/MODERATOR authority are recorded in the durable audit intent atomically with removal; comment text is not copied into audit payloads. Concurrent authorized removals serialize and produce one removal/audit intent; subsequent authorized retries return unchanged. Audit failure rolls deletion back. No migration or physical deletion is introduced.

Web exposes a reason prompt; Flutter uses a dedicated bounded reason form. Server-authorized removal controls are shown per comment. Successful removal reloads latest, clears a reply target and retains children/unavailable-parent context. Failed requests display an error. No external notifications are emitted by this checkpoint.

Two PostgreSQL HTTP cases cover author/current-scoped authority, post-owner refusal, lost roles, validation/foreign IDs, concurrency, retained source/children, hidden-parent context, current hidden/deleted posts and audit rollback. The live browser case removes a parent in a long conversation and reloads the retained child; a mocked native case checks the required reason, request identity and retained-child rendering. Exact-head CI evidence is recorded in PR #5.

This bounded removal workflow does not claim complete moderation: comment reports, case evidence, restore/restrict/escalate, author outcomes/appeals, configured policy and production device/load/accessibility/security/retention acceptance remain mandatory/open. All 260 original acceptance records and 31 frozen NFR targets remain unchanged; authority gates remain closed. No merge, deployment or real-user data removal.
