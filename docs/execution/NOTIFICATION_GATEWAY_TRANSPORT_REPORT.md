# Notification gateway transport and session recovery

## Verified recovered checkpoint

Recovered branch head: `7249579f512fda06cc78d7a86fd857597b69876e`. PR #5 remains draft, open, unmerged and based on `feat/m4-governed-workflows`. Both push run 38133745443 and PR run 38133748119 completed successfully. All six PR jobs passed. Platform logs independently confirm 350 unit cases, 478 general integration cases (ten storage cases skipped there and run in the dedicated storage job), 53 browser cases, dependency audit with no known vulnerabilities, builds and the disposable fictional restore. Android/live API, Flutter, scanner, private storage and fictional million-Person repository benchmark jobs are successful. These are source-bound engineering checks, not final production acceptance.

This recovery began in an empty scratch workspace. A fresh clone matched the remote branch and had no tracked modifications. It cannot establish whether an inaccessible prior container or user device retains unpublished work. No existing implementation, frozen specification, architecture decision or acceptance classification was changed.

## Change

Push and email gateways now reject redirect following. A redirected response is also rejected defensively. Production URLs require HTTPS; all environments reject credentials in URLs, fragments, non-HTTP schemes and malformed URLs with a fixed private-data-safe failure code. Only explicit PUSH_GATEWAY_URL and EMAIL_GATEWAY_URL select these HTTP adapters: FCM_SERVER_KEY and SMTP_HOST are no longer interpreted as HTTP endpoints. Configure explicit HTTPS gateway URLs before rollout. Unsupported channels fail instead of returning fabricated delivery success.

The current adapters still treat an ordinary successful gateway response as acceptance under the existing contract. This batch does not prove receipt/device delivery or implement provider reconciliation, authentication, token registration or FCM/APNs integration. Gateway network egress controls and live provider contracts remain mandatory.

## Validation

Nine direct assertions against the actual URL policy passed using Node 24 native TypeScript loading. Release assessment and workbook validators passed; all 260 requirements, 31 frozen NFR targets, 14 workbook sheets and 195 columns remain preserved. Whitespace validation passed. Added Jest cases cover URL policy, redirected responses, request redirect policy and unsupported channels. Full Jest/typecheck/build and exact-source CI results must be independently verified after publication; none are inferred from the recovered head. The initial frozen dependency install was interrupted; a retry uses a scratch store without altering the repository's Windows D: configuration.

## Remaining production blockers

The validator retains 102 completed /133 partial /13 missing /12 external classifications and all 260 final acceptance rows open. Push-token lifecycle, invalid-token handling, provider idempotency/receipt reconciliation, remaining functional workflows and approved workbook promotion remain unfinished. Complete production-like load/backpressure/failure testing, full accessibility and iOS/device evidence, monitoring/paging, managed infrastructure/secrets/TLS, production PITR/RPO/RTO drills, legal/privacy/cultural/data/provider approvals and named release sign-off remain open. Fictional tests never authorize production data import or cultural rule activation. No merge or deployment.
