# Bounded native family-tree exploration

GEN-FR-009 and GEN-FR-010 remain partial. This checkpoint implements a native traversal gap; it does not close signed acceptance, production-scale performance, supported-device or accessibility acceptance.

The frozen Master Requirements require navigable parents, grandparents, spouses, children, siblings, descendants and extended relatives, progressive expansion, small-screen focus controls and an accessible alternative to spatial navigation. The existing API already returns nested ancestor trees, depth-boundary indicators and privacy-filtered relationships. Native rendering previously omitted grandparents nested under a parent and supplied no expansion controls.

## Implemented boundary

- The native tree recursively renders the returned parent structure with parents side by side above their child. Nested grandchildren and spouses retain independent profile-detail controls. Living/deceased status stays neutral and textual.
- Focus and depth-boundary ancestor/descendant controls fetch a fresh context of at most two ancestor and two descendant generations through the existing server. Focusing a parent exposes permitted siblings; focusing other connected people permits further exploration. No unseen relative is fabricated, no cultural relationship term is inferred and no draft cultural rule is activated.
- Every request reuses the existing server authorization/privacy filtering and 500-node budget. Previously displayed nodes are replaced by the new bounded context, rather than accumulated indefinitely. Previous-focus history retains at most 100 IDs; previous-focus and canvas reset controls preserve exploration without fetching the whole graph.
- A scrollable list/path alternative offers the same detail/focus/expansion actions for users who cannot operate the spatial pan/zoom view. Controls have bilingual text or tooltips and touch targets of at least 48 logical pixels. Guidance can scroll on short screens rather than forcing the canvas below the viewport.
- Replacement session generations clear displayed context/history and discard late results. A disposed screen, changed root/service or superseded request cannot receive an old result. Token refresh preserves the service generation and therefore does not itself discard the screen. Loading/error states and retry preserve the selected bounded context; raw server/private error text is not rendered.

## Verification

`apps/mobile/test/tree_navigation_test.dart` adds six focused widget regressions for nested ancestor rendering, parent-to-sibling refocus, profile navigation, exact bounded fetch parameters, boundary expansion, scaled text/list navigation and a short viewport, retry/history after failed expansion, late responses after root replacement/disposal, and session replacement before/after results. The fake API overrides the profile read and rejects unexpected HTTP rather than contacting a live service. Existing search/detail/tree smoke coverage remains unchanged.

Local whitespace verification (`git diff --check`) passed. Flutter and Dart executables are unavailable in this workspace at this checkpoint, so compilation, analysis and widget execution are pending. Full exact-head Flutter and native CI evidence must be recorded before considering this change verified. No acceptance classification, frozen ledger entry, cultural gate, production migration, merge or deployment is changed.

Complete sibling/extended-relative release acceptance, large-family/device behavior, production latency/scale, independent accessibility assessment and all other release gates remain mandatory. The 500-node safety ceiling can still reject a very wide context; this checkpoint does not introduce child pagination or claim million-person performance acceptance.
