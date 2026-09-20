# Development recovery checkpoint

This file records executable progress so work can resume without a conversation transcript.

## Source and preservation

- Recovery baseline: `77ec6c40afd9cd608655c82a4e990823aa6b0fcb`.
- Branch: `feat/m4-governed-workflows`; PR #4 targets `develop` and remains open.
- Work is performed in an isolated source checkout. Uncommitted Windows work, D: storage, PostgreSQL/Redis data, backups and unrelated workloads have not been imported, overwritten or reset.
- Before resuming, inspect `git status`, the current branch and the remote HEAD. Preserve any existing changes; do not reset or clean the working directory.

## Checkpoint 1: privacy authorization

- Export branch selection uses administrative role assignments instead of every membership branch, and retains those assignments in the privacy viewer context.
- Detail, relatives and tree reads use current VERIFIED parent/child/spouse relationships loaded once per request. Relationship display objects do not grant permission.
- Inaccessible tree roots are rejected; inaccessible relatives are omitted without exposing their IDs.
- HTTP regression cases cover mixed branch roles, verified/unverified family links, family tree roots and revoked spouse verification.
- Local shared package builds, API TypeScript checking and all 107 backend unit tests passed. PostgreSQL CI results must be recorded after execution; this file does not declare an unexecuted acceptance pass.

## Remaining M4 acceptance work

1. Correct Flutter OTP contracts and provide an actual sign-in/session flow, refresh, logout and authenticated workflow checks.
2. Replace optional browser workflow checks with mandatory claims approvals, change approval, RSVP and persistence assertions using fictional fixtures.
3. Add HTTP regression evidence for both authenticated private-media routes and profile transaction consistency.
4. Verify a real ClamAV daemon and a real Android/API workflow, or explicitly retain their blocked status.
5. Update the delivery report from actual completed test output and the final commit's CI results.

## Application release scope

M4 acceptance is distinct from completion of the entire application. The master implementation plan also includes community/moderation, maps, messaging, offline synchronization, import, deployment and release verification. Cultural/legal/provider activation gates remain governed by `OPEN_GATES.md`; do not invent approvals or credentials. Keep test doubles identified as test doubles.
