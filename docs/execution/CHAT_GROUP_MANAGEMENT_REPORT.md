# Governed group-chat checkpoint

This change extends calendar head `dfe61a70a486eaa4b1159c0cb70f7d747ff38199` on `feat/application-completion`. Migration 020 adds private `GROUP` conversations, group description/version, participant OWNER/ADMIN/MEMBER roles, explicit removal markers and private history boundaries. It preserves direct messaging and existing branch rooms.

| Requirement | Implementation added | Acceptance still open |
|---|---|---|
| CHAT-FR-002 | Selected-member private groups, information editing, add/remove and branch membership management; web and Flutter controls | Large branch-roster pagination and full device/product acceptance |
| CHAT-FR-010 | Owner/admin/member authority, owner-only role changes, atomic ownership transfer, owner-leave protection | Orphaned legacy-group recovery policy and final acceptance |
| CHAT-FR-006 | New/restored private members receive history after their membership boundary | Retention, full reconnect/device matrix and load acceptance |
| CHAT-FR-013 | Current account/role/member checks, bounded selections, optimistic versions and transactional audit intent | Full abuse and security/load acceptance |

## Authority and privacy

- Private groups require the creator and selected profiles to have current verified, active adult accounts. Selection follows current genealogy visibility; blocked invitations, protected/uncertain-age profiles, duplicate IDs, self-selection and oversized selections are rejected. Creation is all-or-nothing with audit intent.
- Private groups support up to 50 active members. Branch rooms retain explicit current-branch join rules. A removed branch member cannot self-join or use branch-room creation to restore membership; a group administrator must add them again.
- Group roles are distinct from platform roles. Platform administration alone grants no access to private groups. Active membership is required for both message and management access.
- Owner/admin may change information and add eligible members. Admins may remove ordinary members; only the owner may change roles or remove another admin. Nobody may remove the owner. Owner transfer is atomic and the owner cannot leave before transfer. A unique partial index prevents multiple active owners.
- Version checks and conversation-row locks serialize management against messages, joins, leaves and concurrent ownership transfers. All mutations retain durable audit intent; failure rolls back the change.
- Newly added or restored private members cannot see older messages, old unread counts or earlier queued notices. Removal revokes HTTP access, notification visibility/delivery and the next WebSocket authorization poll. Re-addition restores MEMBER authority and starts a new history boundary. Branch rooms preserve their existing shared-history behavior.
- Rosters contain no phone numbers and mask currently private/protected/archived profile names. Message content does not enter group-management audit events.

## Verification and remaining work

Tests cover selected creation, current eligibility, nonmember Super Admin denial, roles, stale/concurrent edits and transfers, owner leave protection, branch removal, private history/unread/notice boundaries, masking, audit rollback and live-socket revocation. A browser workflow exercises create/promote/settings/remove/restore/transfer/reload. Flutter checks owner promotion/version submission and ordinary-member controls.

Exact CI results must be associated with the published group-management head. Earlier calendar CI does not verify migration 020. Original 260 mandatory acceptance rows and the baseline assessment remain unchanged.

Chat media, reporting/moderation, delivered receipts, persistent offline queues and production load/retention/device acceptance remain open. This does not authorize exceptional administrative message-content access. Legacy groups lacking an active creator require a separately governed recovery policy. The current roster endpoint returns at most 200 branch members; larger branch-roster pagination remains open. Rollback refuses existing private groups instead of converting them into legacy direct/branch rooms.
