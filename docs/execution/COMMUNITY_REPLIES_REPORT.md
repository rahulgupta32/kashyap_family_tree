# Community reply controls

Web and Flutter community comments now let members select an existing comment as the reply target, see its content before submitting, and cancel the target to post a top-level comment. Submitted replies use the existing parentCommentId contract; the server continues to bind the author to the authenticated session and requires a live parent in the same visible published post. Successful submission clears the target; failed submissions retain it for correction/retry. Opening another web post clears the draft and target.

Both clients display the parent content beside a reply. If the parent is unavailable in the loaded result, they explicitly say so instead of inventing context. This is a flat chronological conversation with parent context, not a complete nested tree. Existing reads still cap comments at 200: complete pagination, comment moderation and production accessibility/device/scale acceptance remain mandatory.

Regression coverage extends the live browser workflow through a persisted parent/child submission, the real PostgreSQL HTTP case through exact parent linkage, and adds a mocked Flutter reply/cancel/top-level workflow. These checks do not replace signed acceptance. Exact-head CI outcomes are recorded in PR #5. All frozen acceptance fields and authority gates remain open and unchanged. No migration, merge or deployment.
