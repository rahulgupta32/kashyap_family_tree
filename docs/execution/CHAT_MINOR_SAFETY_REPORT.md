# Current direct-chat minor protection

## Demonstrated gap and frozen policy

Direct conversation creation rejected a protected/uncertain-age target but did
not check the initiating member's current profile. A verified minor could choose
an adult, obtain a direct conversation and receive the adult's replies. Existing
conversation access, message sends, lists and delayed notification delivery also
did not recheck participant age or account/profile links after a correction.

The frozen Privacy Data Retention Policy v1.0, section 6.1 (extracted text line
177), restricts minor accounts pending an approved age/verification model and
restricts direct messaging from unknown adults. Master requirement PRIV-FR-003
requires privacy-safe treatment of minors; the master minor constraints require
governed guardian/representation rules. The implementation retains the existing
conservative target restriction symmetrically. No family/guardian exception or
legal approval is inferred or introduced.

## Resulting behavior

A shared helper applies the existing PrivacyEngineService age model to both
current participants, including exact BS birthday boundaries, uncertain ages
and explicit protection. Missing, archived or physically removed profiles,
inconsistent claim ownership, lost eligible roles and inactive accounts fail
closed. Direct creation and transaction-backed access lock current account links
and person records while committing mutations. Denials contain no DOB, account
or participant identifiers.

Existing direct history, metadata, receipts and sends become unavailable when
either current participant loses eligibility. The next subscribed WebSocket
poll uses the same access check. Original/derivative member attachment reads
and uploads also use that check. Conversation lists omit the affected direct
conversation. Queued in-app notices and their unread counts/read mutations are
hidden; external notification scheduling, provider delivery, retries and expired
lease recovery recheck the same current eligibility. Authorized reported-record
moderation remains the existing separate exceptional evidence workflow.

Group/branch conversation policy and existing block/history rules are preserved.
Conversation list checking batches only the existing bounded 100-row candidate
list. Inbox eligibility scans in cursor batches of 500 conversations and retains
eligible UUIDs for SQL visibility/count/read-all. Its cumulative time and ID
memory remain proportional to a member's direct-conversation history; deployed
load acceptance remains necessary. It does not claim constant-time counting.

## Verification scope

Focused helper tests cover symmetric denial, current claims/roles, missing
participants, exact eighteenth birthdays, uncertain/invalid dates, bounded list
selection and multi-page inbox scanning. PostgreSQL/HTTP regression cases cover
minor/uncertain/protected/unlinked creators, current-age/link/claim/role/archival
revocation, preserved adult history, live-socket closure, private attachment
revocation, inbox visibility/count/read controls, initial provider scheduling,
retry and expired-lease suppression. Raw direct-notification test fixtures now
link both accounts to fictional claimed adult profiles.

Local API typecheck and the existing unit run including the 13 helper cases
passed during this batch. Real PostgreSQL/HTTP and CI results must be recorded by
the publishing session; this report does not claim they passed before execution.
No release acceptance row, cultural/legal gate, merge or production deployment
is closed by this correction.
