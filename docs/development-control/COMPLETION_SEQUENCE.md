# Production completion sequence — 15 October 2026

Owner/release authority: Jyphra Technology Pvt. Ltd. Status: NOT READY. This is the execution queue for the existing mandatory frozen scope, not a scope reduction, approval or release date. It supersedes speculative next-feature suggestions in older NEXT_TASK snapshots. Frozen requirements and acceptance ledgers are unchanged.

## Reconciliation and planning rule

Reviewed the complete 260-row requirement register, independent 260-case edge register, 2924-record supplemental source inventory, release checklist, external handoff, operations boundary and older execution maps. The machine-readable companion assigns every requirement exactly once to a completion milestone and retains its exact requirement, acceptance, NFR target, registered remaining work and required evidence. All remain OPEN. Each milestone also inherits applicable independent edge cases and supplemental controls; these are not optional or replaced by this assignment.

The register is a conservative static assessment at c80433c6. Later source-bound reports supersede specific pending or missing-code statements. Its 102 implemented/137 partial/9 not implemented/5 externally blocked/7 owner approval classifications are not percentages of product completion. A complete per-line source/security audit of every module has not been performed in this reconciliation. Recheck actual current code before turning a historical gap into new work.

Fresh source checks confirm: cultural rule proposals are still held in an in-memory Map; import reports explicitly prohibit promotion; general consent columns exist but a versioned policy acknowledgement flow was not found in the inspected auth/profile routes. These are implementation candidates, not completed audits of those domains. Existing protected native push, private storage, idempotency and current calendar improvements must be preserved.

## Ordered functional milestones

Work through F1–F6 in dependency order. Start the owner handoffs below immediately; implement with fictional fixtures while real approvals are outstanding. Security, bilingual UI, accessibility, private-state isolation, retry behavior and relevant regression evidence are part of every functional milestone, not postponed cleanup.

| Order | Scope and assigned requirements | Concrete remaining implementation review | Exit condition |
|---|---|---|---|
| F1 | Identity, profiles, claims, privacy — 44 | Versioned consent/policy acknowledgement; full profile/claim next actions and permitted field history; supporting evidence attachment lifecycle; language preference; account/de-link/deletion and device/session cases; stronger admin factors and governed recovery only under approved policy | API/admin/mobile member lifecycle journeys, authorization/negative/offline/account-switch cases and append-only evidence pass; approved policy/legal/security acceptance separately recorded |
| F2 | Genealogy, search, change requests, duplicates — 50 | Complete member/reviewer forms and evidence wiring, graph-impact preview, broader tree context/pagination, deterministic search/duplicate signals, branch/connection repair; controlled import transform/promotion/resume/reconciliation design after approved mapping | Verified graph invariants and role scope, duplicate/conflict/retry cases, realistic tree/search tests and fictional import/recovery rehearsals; real data approval remains D1 |
| F3 | Relationships, cultural content, Jutho — 32 | Durable proposal/review/approval/history instead of in-memory rule proposals; approved-path explanation and alternate/cousin/affinal results; rich cultural references/attachments; rule freshness/material audit; complete neutral unavailable UI | Restart/concurrency/independent-approval tests and member/admin journeys; signed rules/reference cases required before authoritative activation; HG gates stay closed |
| F4 | Community, messaging, media — 34 | Configurable category/risk moderation, complete report/appeal/restore/user cases, immediate block effects, richer media and retention, group roster/recovery, reconnect/history/receipt preferences and multi-device/private cache checks | End-to-end author/member/moderator/chat/media journeys, scan/access/retention/retry negatives and current-policy enforcement; no exceptional private-chat access invented |
| F5 | Calendar, invitations, notifications, map — 43 | Finish invitation presentation/recipient changes/RSVP interfaces and approved family/follower audiences; full destination matrix and provider lifecycle; Person-derived reminders only with approved source; safe venue/provider map rendering; source representations only with approved conversion | Member/organizer/admin journeys, exact recipient/version/privacy/reminder/outbox tests and supported-device checks; real provider and signed calendar acceptance separately supplied |
| F6 | Administration, audit, configuration — 21 | Complete user status/role/verifier console, queue/integration/import surfaces, approved typed settings, correlation/request audit filters and read-audit coverage, cross-branch metadata/repair; reconcile all new workflows' audit histories | Current-authority admin journeys, independent review/recusal, safe minimized audit/status views and transactional change history; no editable secrets/authority bypass |

End-time/all-day legacy contract fields are not an automatic next feature. The inventory search did not identify an explicit duration control under those names. Map any proposed duration behavior to exact binding source and accepted storage/API semantics before adding it. This does not waive a requirement that a deeper source review identifies.

## Candidate assurance and release milestones

| Order | Deliverable | Required proof |
|---|---|---|
| D1, alongside F2/F3 | Approved real data and domain inputs | Named data/domain authorities; source ownership/consent; signed mapping/transforms/privacy; duplicate/target reconciliation; controlled promotion/resume; two isolated real-approved rehearsals and rollback/sampling; no fictional data promoted |
| Q1 | Complete bilingual, accessible supported-client experience — 9 assigned requirements | Externalized keys and language persistence; approved Nepali/English translations; WCAG 2.2 AA admin and mobile semantics/scalable text/touch/screen reader; supported OS/device and intermittent-network matrix |
| Q2 | Independent security, privacy, correctness/reliability — 11 | Threat/DPIA/penetration findings and remediation; complete authority/field/minor/location/export/cache/retention review; transactional/retry/audit controls, locked dependencies/migrations and exact-case acceptance |
| P1 | Actual capacity and latency — 7 | Authenticated HTTP reads p95<=500ms, writes<=800ms, search<=1s, initial tree<=2s, connected message delivery<=2s; million-Person workflows, 100k registered accounts/10k concurrent realtime sessions; realistic network/distributions, errors/queue/DB limits, repeatable reports and accepted configuration |
| O1 | Approved reproducible production operations — 9 | Managed TLS/secrets/private storage/scanner/worker fleet, actual correlated telemetry/alert routing/owners/budget signals, production-like PITR/object recovery with RPO<=15min/RTO<=4h, measured rollback/failover and quarterly drill ownership |
| R1 | Signed mobile and live integrations | Approved app identities/Apple/Google accounts/signing, physical devices, real SMS/FCM/APNs permissions/tokens/background/terminated/recovery and privacy disclosures/support/deletion URLs |
| R2 | Integration review and release decision | Independent PR4 then PR5/migration review under existing branch policy; all E2E-001..016, 260 requirement/260 edge-case and applicable supplemental acceptance on exact candidate; all RG-01..12 closed; Jyphra signed go/no-go and authorized rollout/rollback/incident command |

Engineering and owner-input activities can overlap, but dependent acceptance cannot close early. Existing no-merge/no-deploy authorization remains in force. Do not retarget PRs, submit stores or provision paid services without the applicable authorization. Existing PR5 stays on its base until the recorded review/integration process is authorized.

## Inputs that need named owners now

These are required handbacks, not fictional assignments: product/UAT approver; data steward and real consent/source package; cultural/legal/privacy decision makers and signed catalogues; security/accessibility/translation/device reviewers; approved hosting/providers and managed credentials; mobile signing/accounts/physical device coverage; operations/on-call/alert recipients/budget and incident command. Use EXTERNAL_HANDOFF for accepted ownership. Their absence does not stop independent code preparation but does stop their acceptance gates.

## Work and evidence cadence

1. Select the next concrete incomplete journey inside F1 (first inspect versioned consent and supporting evidence), using the complete register rather than another isolated cosmetic field. If a dependency is blocked, record it and take the next independent item in the same milestone.
2. Finish its API/database transactions, admin/mobile UX, authorization/privacy, unhappy paths, localization/semantics and tests together. Preserve newer source and existing safe retries.
3. Run focused local checks; use affected fast CI during implementation. Let mandatory full/native runs execute independently; record failures and fix demonstrated causes without loosening assertions/timeouts. No duplicate full workflow to chase a pending result.
4. Publish reviewed recoverable implementation checkpoints on the existing branch and keep working on independently testable items when appropriate. A documentation-only status update does not need another commit just to trigger more CI; append exact-source evidence to PR5.
5. Close a functional milestone only with requirement-specific end-to-end proof. Aggregate test totals cannot close frozen acceptance. Retain candidate SHA/tree/config/artifact, actual result, reviewer and remaining authority gate.

A responsible launch date requires the measured remaining journey inventory, an appointed staging/candidate environment, named reviewers and dates for the owner inputs. Existing historical staffing estimates are not a current delivery commitment. The acceleration is fewer fragmented batches, fewer repeated status commits, and complete cross-layer journeys; no mandatory scope is silently dropped.

## Immediate source recovery

Baseline ac3406229be61f6aa68f327be5f275c81fef91e6: Fast38729583986 SUCCESS; platform job116403788170 passed454 unit/553 general integration, then browser67 passed/one failed. Real organizer test left default KUL_PUJA while requesting ordinary-only details/time fields. Correct the fixture to explicitly choose GENERAL_EVENT using a labelled type control; preserve category protections and all assertions/timeouts. Parent main/native conclusions remain source bound. Resolve the current published SHA/tree/runs from PR5 handoff. After verifying this fix, move to F1, not further speculative calendar field additions.
