# Convex Query/Mutation Audit

Date: 2026-03-08

## Executive Summary

Reviewed all 96 exported Convex functions under `my-app/convex` and the material React call sites under `my-app/src/components`.

Findings summary:

- 6 high-severity findings
- 8 medium-severity findings
- 2 low-severity findings

Main themes:

- Two user-facing reactive list queries implement pagination in memory after broad `.collect()` calls, which is the highest-cost pattern in the repo.
- Sync and backfill flows repeatedly scan whole tables or perform N+1 lookups in loops, which will degrade quickly as catalog, order, and issue counts grow.
- A few actions and maintenance flows are split across more `runQuery` / `runMutation` hops than necessary.

## Remediation Status

Implemented:

- `H1` and `H2`: pricing series/issues now use indexed Convex pagination instead of full-table materialization.
- `H3`: sync candidate selection and stale tracked-set refresh now use derived `catalogSets` state and indexed candidate reads instead of recomputing rule scope from broad scans on recurring sync paths.
- `H4`: order ingest and sync now batch catalog-link enrichment and avoid one mutation call per order.
- `H5`: per-set pricing sync now runs as chunked internal actions with bounded batch mutations instead of one oversized mutation transaction.
- `H6`: historical shipment matching now pages a bounded created-at window instead of reading the full public orders list.
- `M2` and `M4`: picker queries and standalone shipment queries no longer mount broad reactive scans.
- `M7`: tracked-series search now uses a search index, and issues filtering for type/ignored state now uses indexed branches instead of post-pagination filtering.

Still open:

- `M1`: `pricing.queries.listRules`
- `M3`: `catalog.queries.getSyncSummary`
- `M5`: export actions still do per-order query fan-out

Deferred because the database is currently empty:

- `M6`: public backfill/repair jobs are not actionable until real data exists
- `M8`: legacy manual-product rule backfill is irrelevant without existing rows

What is already good:

- `orders.queries.listPage` uses Convex pagination correctly with indexed ordering.
- `pricing.queries.searchCatalogProducts` uses a search index and bounded `.take(...)`.
- `shipments.queries.listRefreshCandidates` bounds work with indexed `.take(...)`.
- Cleanup mutations such as `catalog.mutations.cleanupSetSnapshot` use chunked indexed deletes instead of whole-table deletes.
- The admin pagination helpers in `pricing/admin.ts` are shaped correctly.

## Review Rubric

This audit compared the codebase against official Convex guidance for:

- Queries: https://docs.convex.dev/functions/query-functions
- Mutations: https://docs.convex.dev/functions/mutation-functions
- Actions: https://docs.convex.dev/functions/actions
- Indexes: https://docs.convex.dev/database/reading-data/indexes/
- Pagination: https://docs.convex.dev/database/pagination

The key standards applied were:

- prefer indexed range reads over broad `.collect()`
- do not materialize whole result sets only to filter or paginate in JavaScript
- reserve actions for external I/O or orchestration, and keep database-heavy work in queries/mutations
- keep transactions bounded so they do not grow with table size
- align schema indexes with real query filters and sort order

## Ranked Findings

### H1. `pricing.queries.listTrackedSeries` implements client-visible pagination by collecting and filtering the entire result set

Location:

- `convex/pricing/queries.ts:170`
- `src/components/PricingDashboard.tsx:692`

Pattern:

- The query chooses one of several `.collect()` branches over `pricingTrackedSeries`.
- It then applies multiple JavaScript `.filter(...)` passes, sorts in memory, and slices with a custom cursor via `paginateArray(...)`.
- The UI treats this as a paginated reactive list.

Why this diverges from Convex guidance:

- Convex pagination is intended to page database results, not arrays that were already fully materialized.
- Broad `.collect()` plus JS filtering defeats index selectivity and makes reactivity expensive because every subscription recomputes the whole list.

Impact:

- Latency grows with total tracked series count, not page size.
- Bandwidth and reactive recomputation cost grow even when the user only sees 50 rows.
- The query shape prevents Convex from doing the filtering and ordering work efficiently.

Recommendation:

- Replace the custom `cursor` / `paginateArray` flow with real `paginationOptsValidator` pagination.
- Split the query into indexed branches that match supported filters.
- Add indexes to support the actual filter and sort combinations used by the Series tab.
- Move search to a search-index-backed flow or narrow it to an indexable subset.

Effort: `large`

Docs:

- https://docs.convex.dev/database/pagination
- https://docs.convex.dev/database/reading-data/indexes/

### H2. `pricing.queries.listResolutionIssues` repeats the same anti-pattern for the Issues tab

Location:

- `convex/pricing/queries.ts:308`
- `src/components/PricingDashboard.tsx:1058`

Pattern:

- The query uses `.collect()` across `pricingResolutionIssues`, applies several JS filters for `categoryKey`, `issueType`, and ignored state, sorts in memory by `lastSeenAt`, and paginates the resulting array manually.

Why this diverges from Convex guidance:

- This is the same full-read-plus-JS-filter pattern as H1.
- The sort key `lastSeenAt` is not supported by any index, so the query cannot become selective as issue volume grows.

Impact:

- Expensive reactive subscriptions on every issues screen mount.
- Increasing issue history will slow down the UI even when the user requests only the first page.
- The current schema cannot support the query shape efficiently.

Recommendation:

- Convert the endpoint to database pagination.
- Add indexes that match the supported issue filters and the `lastSeenAt` sort.
- Reduce the number of optional filters on one endpoint if necessary and split into indexed branches.

Effort: `large`

Docs:

- https://docs.convex.dev/database/pagination
- https://docs.convex.dev/database/reading-data/indexes/

### H3. Sync candidate selection relies on repeated whole-table scans plus N+1 helper lookups

Location:

- `convex/catalog/queries.ts:116` (`listSyncCandidates`)
- `convex/catalog/mutations.ts:764` (`claimSyncCandidates`)
- `convex/pricing/ruleScope.ts:26` (`listRuleScopedSetKeys`, helper)
- `convex/pricing/queries.ts:354` (`listStaleTrackedSetKeys`)

Pattern:

- `listSyncCandidates` and `claimSyncCandidates` both load all `catalogSets`, compute rule scope in memory, filter in JavaScript, sort in memory, and dedupe in JavaScript.
- The shared helper `listRuleScopedSetKeys` loads all active rules, optionally all sets, then does one catalog product lookup per manual-product rule.
- `listStaleTrackedSetKeys` collects all active series and then performs one `catalogSets.by_key` lookup per distinct set key.

Why this diverges from Convex guidance:

- These are broad scans used on recurring sync paths, not one-off admin tasks.
- The helper structure prevents the database from doing selection work.
- The same expensive logic exists in both a query and a mutation, which duplicates cost and complexity.

Impact:

- Catalog sync scheduling cost grows with total sets, rules, and manual-product rules.
- Internal maintenance jobs become slower and more failure-prone as data grows.
- The duplication increases the chance that query and mutation candidate selection drift over time.

Recommendation:

- Introduce a derived eligibility/read-model field or a dedicated indexed table for sync candidates instead of recomputing scope from raw tables each time.
- Replace per-product lookups in `listRuleScopedSetKeys` with a batched precomputed mapping or a set-scoped join table.
- Add indexes for candidate ordering/claiming rather than sorting full arrays in memory.
- Make one source of truth for candidate selection and have the query/mutation share it without re-scanning the world.

Effort: `large`

Docs:

- https://docs.convex.dev/database/reading-data/indexes/
- https://docs.convex.dev/functions/query-functions

### H4. Order ingest and catalog-link repair perform N+1 catalog lookups inside mutations, then action fan-out calls them repeatedly

Location:

- `convex/orders/mutations.ts:34`
- `convex/orders/mutations.ts:160`
- `convex/orders/mutations.ts:224`
- `convex/orders/mutations.ts:258`
- `convex/orders/sync.ts:15`

Pattern:

- `enrichOrderItemsWithCatalogLinks(...)` does one indexed lookup per distinct SKU and one indexed lookup per distinct product ID.
- `upsertOrder`, `upsertOrdersBatch`, and `backfillCatalogLinks` all depend on that helper.
- `orders/sync.ts` uses `ctx.runMutation(...)` once per order for active/recent syncs.

Why this diverges from Convex guidance:

- Even indexed N+1 loops add transaction cost linearly with order width.
- Calling a mutation per order from an action adds extra Convex function-call overhead on top of the N+1 lookups.

Impact:

- Ingest throughput drops as orders get wider or sync batches get larger.
- Backfills become expensive because each order replays the same lookup pattern.
- The active and recent sync jobs do unnecessary function fan-out.

Recommendation:

- Precompute catalog-link mapping in batches inside an internal mutation, not one lookup per item.
- Where possible, batch orders by shared SKU/product IDs before linking.
- Prefer `upsertOrdersBatch` or another batch-oriented internal mutation for active/recent syncs instead of one `runMutation` per order.

Effort: `large`

Docs:

- https://docs.convex.dev/functions/mutation-functions
- https://docs.convex.dev/functions/actions

### H5. Two pricing mutations are doing too much set-wide read and write work in a single transaction

Location:

- `convex/pricing/mutations.ts:249` (`refreshTrackedCoverageForSetMutation`)
- `convex/pricing/mutations.ts:525` (`captureSeriesSnapshotsForSetMutation`)

Pattern:

- Both mutations collect all set products and related rows into memory.
- Both perform large insert/patch loops inside one mutation.
- `refreshTrackedCoverageForSetMutation` also recalculates per-rule counts by querying active joins again for every affected rule.

Why this diverges from Convex guidance:

- Convex mutations are transactional and should remain bounded.
- These functions scale with total products, SKUs, tracked series, joins, and issues in a set.

Impact:

- Large sets are at real risk of hitting mutation read/write/runtime limits.
- Retrying a failed sync repeats a large amount of work.
- The transaction boundary is broader than necessary.

Recommendation:

- Split coverage refresh and snapshot capture into smaller chunked internal mutations keyed by set and page.
- Precompute or incrementally maintain rule active-series counts rather than recounting joins repeatedly.
- Consider storing smaller derived structures that avoid collecting full product and SKU sets on every sync.

Effort: `large`

Docs:

- https://docs.convex.dev/functions/mutation-functions
- https://docs.convex.dev/functions/actions

### H6. Historical shipment matching loads the full orders table through a public query and filters in JavaScript

Location:

- `convex/shipments/sync.ts:451`
- `convex/orders/queries.ts:110`

Pattern:

- `syncHistorical` calls `api.orders.queries.list`, which returns all orders via `.collect()`.
- The action then filters those orders by date and constructs in-memory matching indexes.

Why this diverges from Convex guidance:

- This is a maintenance job, but it still pays the cost of a public unbounded query and full-table materialization.
- The filtering should happen in the database using the existing `orders.by_createdAt` index.

Impact:

- Historical shipment backfills get slower as total order volume grows, regardless of the requested date window.
- The public `orders.list` endpoint remains an unsafe escape hatch for future UI or maintenance callers.

Recommendation:

- Replace `api.orders.queries.list` usage with an internal paginated query over `orders.by_createdAt`.
- Restrict the matching pool to the requested time window at query time.
- Consider removing or internalizing the public unbounded `orders.list` endpoint.

Effort: `medium`

Docs:

- https://docs.convex.dev/database/reading-data/indexes/
- https://docs.convex.dev/database/pagination

### M1. `pricing.queries.listRules` is reactive but still does broad reads and per-rule follow-up queries

Location:

- `convex/pricing/queries.ts:53`
- `src/components/PricingDashboard.tsx:1703`

Pattern:

- Loads all rules and all rule stats.
- For each rule, may query `catalogSets.by_key` or collect all sets in a category and then filter them in JavaScript.

Impact:

- The Rules tab cost grows with total rules and total sets.
- Category rules are especially expensive because the query recomputes scoped set summaries per rule.

Recommendation:

- Precompute rule dashboard summaries during writes or sync jobs.
- Keep the Rules tab query as a simple read-model lookup.

Effort: `medium`

### M2. Set/category pickers load broad reactive datasets and filter them in the browser

Location:

- `convex/catalog/queries.ts:52`
- `convex/catalog/queries.ts:72`
- `src/components/PricingDashboard.tsx:1320`

Pattern:

- `listCategories` and `listSets` return entire datasets.
- The Create Rule modal filters them client-side.

Impact:

- Fine at small scale, but these subscriptions will become unnecessarily heavy as the catalog grows.

Recommendation:

- Add server-side search or prefix filtering for modal pickers.
- At minimum, add pagination for sets instead of loading the whole catalog reactively.

Effort: `medium`

### M3. `catalog.queries.getSyncSummary` does broad summary reads that do not age well

Location:

- `convex/catalog/queries.ts:327`

Pattern:

- Counts some tables by iterating them and loads all sets and all orders into memory to derive summary counts.

Impact:

- Summary cost scales with overall catalog and order size.
- If mounted reactively, every change causes a broad recomputation.

Recommendation:

- Turn this into a derived summary/read-model updated during writes or sync completion.
- If it remains query-time, use smaller targeted counts and avoid collecting full `orders` and `catalogSets` arrays.

Effort: `medium`

### M4. `shipments.queries.listStandalone` is an unbounded reactive shipment scan

Location:

- `convex/shipments/queries.ts:92`
- `src/components/StandalonePostageScreen.tsx:193`

Pattern:

- Collects all shipments, filters for standalone purchased shipments without tracking updates, then sorts in memory.

Impact:

- The standalone screen cost grows with total shipment count, not with the small subset it actually displays.

Recommendation:

- Add an index or a small derived table for standalone, refreshable shipments.
- Avoid subscribing the screen to the entire shipments table.

Effort: `medium`

### M5. Document export actions fetch orders one at a time with `ctx.runQuery(...)`

Location:

- `convex/orders/actions.ts:43`

Pattern:

- `loadOrders(...)` issues one `ctx.runQuery(api.orders.queries.getById, ...)` per selected order ID.

Impact:

- Export cost grows linearly in Convex function-call overhead, not just DB cost.
- This is avoidable because the action already knows it needs a batch of orders.

Recommendation:

- Add an internal batch query or move the batched read into an internal action helper that performs direct DB reads once.

Effort: `small`

### M6. Several public backfill mutations are full-table repair jobs that should stay chunked or internal-only

Location:

- `convex/orders/mutations.ts:167`
- `convex/orders/mutations.ts:325`
- `convex/orders/mutations.ts:366`
- `convex/shipments/mutations.ts:125`
- `convex/pricing/mutations.ts:817`

Pattern:

- These mutations collect full tables and patch rows in loops.
- Most are migration/repair jobs, not normal user mutations.

Impact:

- They are easy to hit transaction limits with as data grows.
- Being public increases the chance they are called like normal application mutations.

Recommendation:

- Move them behind internal actions that page through internal chunked mutations.
- Keep repair jobs separate from public app APIs.

Effort: `medium`

### M7. First-pass pricing pagination remediation still under-fills pages when selective filters are applied after pagination

Location:

- `convex/pricing/queries.ts`
- `src/components/PricingDashboard.tsx`

Pattern:

- The first remediation pass replaced full-table pagination with real Convex pagination over indexed base ranges.
- However, some filters still apply after each paginated DB page is fetched:
  - tracked series: `search`, `pricingSource`, `printingKey`
  - issues: `issueType`, ignored-state filtering in some branches
- When those filters are selective, the UI can receive partially filled pages even though more matches exist later in the range.

Impact:

- Much better than full-table `.collect()`, but still not decision-complete from a query-design perspective.
- Users can see sparse pages and need extra pagination clicks for dense result sets.
- The remaining filter work still burns reactive compute on rows that are discarded.

Recommendation:

- Add narrower query variants and indexes for the most-used selective filters.
- Move free-text search onto dedicated search-backed endpoints instead of post-filtering paginated index ranges.
- Treat the current implementation as an interim performance fix, not the final query shape.

Effort: `medium`

### M8. Manual-product rules do not backfill denormalized set/category scope for older rows, so sync helpers still need fallback product lookups

Location:

- `convex/pricing/mutations.ts` (`createManualProductRule`, `enqueueRuleAffectedSetSyncs`)
- `convex/pricing/ruleScope.ts` (`listRuleScopedSetKeys`)

Pattern:

- New code can persist `setKey` and `categoryKey` on manual-product rules, which lets sync scheduling and rule-scope checks treat them like direct set-scoped rules.
- Older manual-product rules created before that change still only carry `catalogProductKey`.
- Those legacy rows force the helper path to keep querying `catalogProducts.by_key` as a fallback during sync candidate evaluation and set-sync scheduling.

Impact:

- The hot path is improved for new rules, but legacy data still pays avoidable N+1 lookup cost.
- Behavior remains correct, but the expensive fallback will stay in place until old rows are repaired.

Recommendation:

- Keep the fallback for correctness.
- Add a one-time internal backfill that pages through `pricingTrackingRules` and writes `setKey` / `categoryKey` onto legacy `manual_product` rows.
- After the backfill, simplify helper paths to treat manual-product rules as directly set-scoped unless a row is malformed.

Effort: `small`

### L1. Shipment/order actions use more function hops than necessary for local DB context

Location:

- `convex/shipments/actions.ts:396`
- `convex/shipments/actions.ts:421`
- `convex/shipments/actions.ts:459`
- `convex/shipments/actions.ts:632`
- `convex/shipments/actions.ts:678`

Pattern:

- Several actions first load DB context through `runQuery(...)` wrappers and then call mutations separately.

Impact:

- This is mostly overhead and complexity, not a correctness bug today.

Recommendation:

- Collapse repeated local DB reads into internal helpers or an internal query/mutation layer closer to the action.

Effort: `small`

### L2. `pricing.admin.rebuildDashboardReadModels` is correct but O(rules + active joins per rule)

Location:

- `convex/pricing/admin.ts:52`

Pattern:

- The rebuild action paginates correctly, but it still walks every rule and then paginates active joins for each rule.

Impact:

- Acceptable for manual admin rebuilds, but expensive for frequent use.

Recommendation:

- Keep it as an admin-only maintenance path.
- If used regularly, replace the rebuild with incremental read-model maintenance only.

Effort: `small`

## Index Opportunities

Current schema references:

- `pricingTrackedSeries` indexes at `convex/schema.ts:262-265`
- `pricingResolutionIssues` indexes at `convex/schema.ts:305-308`
- `catalogSets` indexes at `convex/schema.ts:131-132`

Recommended directions:

### `pricingTrackedSeries`

Current problem:

- `listTrackedSeries` needs combinations of `activeOnly`, `setKey`, `categoryKey`, `pricingSource`, optional search, and stable ordering by recency.

Likely additions:

- `by_active_categoryKey`
- `by_setKey_updatedAt`
- `by_active_setKey_updatedAt`
- `by_active_pricingSource_updatedAt` or a narrower query split that avoids this filter combination

Note:

- If free-text search remains required, use a search-index-driven path instead of collecting and filtering the whole table.

### `pricingResolutionIssues`

Current problem:

- `listResolutionIssues` filters by `activeOnly`, `setKey`, `categoryKey`, `issueType`, ignored state, and sorts by `lastSeenAt`.

Likely additions:

- `by_active_lastSeenAt`
- `by_active_setKey_lastSeenAt`
- `by_active_categoryKey_lastSeenAt`
- possibly `by_active_issueType_lastSeenAt` if issue-type filtering stays first-class

Note:

- Ignored state may be better represented by a separate boolean field if it needs indexed filtering.

### `catalogSets`

Current problem:

- Sync-candidate selection currently cannot be expressed efficiently from indexes, so the code scans all sets and sorts in memory.

Likely additions or redesign:

- add derived candidate state fields and index them
- or maintain a separate sync-candidate/read-model table
- possible supporting indexes: `by_syncStatus`, `by_pricingSyncStatus`, `by_nextSyncAttemptAt`

Note:

- Pure indexing alone may not be enough because rule scope is currently recomputed from multiple tables each time.

## Frontend Usage Amplifiers

### Series tab

- `src/components/PricingDashboard.tsx:692` subscribes to `pricing.queries.listTrackedSeries`.
- The query is reactive, but the backend materializes the full filtered population before returning a page.

### Issues tab

- `src/components/PricingDashboard.tsx:1058` subscribes to `pricing.queries.listResolutionIssues`.
- Same pattern as the Series tab.

### Rule creation modal

- `src/components/PricingDashboard.tsx:1320` and `:1324` subscribe to full category/set lists, then filter locally.

### Standalone postage screen

- `src/components/StandalonePostageScreen.tsx:193` subscribes to `shipments.queries.listStandalone`, which scans all shipments.

### Bulk fulfill action

- `src/components/OrdersTable.tsx:740` fires `Promise.all(...)` over `api.shipments.actions.setFulfillmentStatus`, creating client-side action fan-out per selected order.

## Remediation Backlog

### Now

- Replace `listRules` with a read-model-backed query.
- Turn `catalog.queries.getSyncSummary` into a cheaper derived summary/read-model.
- Finish the pricing-query follow-up so selective filters do not under-fill paginated pages.
- Replace per-order export action reads with a batch read helper.

### Soon

- Convert repair/backfill mutations into internal chunked jobs if persistent data is introduced.
- Add a one-time manual-product rule scope backfill if legacy rules ever exist in a non-empty database.

### Later

- Collapse low-value action hop layers in shipment actions.
- Keep admin rebuild flows admin-only and infrequent.
- Remove or internalize unbounded public list queries that are only useful for maintenance.

## Coverage Matrix

Legend:

- `Acceptable`: reviewed and no material finding
- `H#`: tied to a high-severity finding above
- `M#`: tied to a medium-severity finding above
- `L#`: tied to a low-severity finding above

### `convex/catalog/mutations.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| upsertCategoriesBatch | internalMutation | Acceptable | Bounded batch writes; helper refresh cost is secondary |
| upsertSetsBatch | internalMutation | M2 | Post-write dashboard refresh work scales with touched sets/products |
| markSetSyncStarted | internalMutation | Acceptable | Simple indexed patch |
| markSetSyncCompleted | internalMutation | Acceptable | Simple indexed patch |
| markSetSyncFailed | internalMutation | Acceptable | Simple indexed patch |
| markPricingSyncStarted | internalMutation | Acceptable | Simple indexed patch |
| markPricingSyncCompleted | internalMutation | Acceptable | Simple indexed patch |
| markPricingSyncFailed | internalMutation | Acceptable | Simple indexed patch |
| requestSetSync | internalMutation | Acceptable | Correct transactional state flip |
| consumePendingSyncMode | internalMutation | Acceptable | Correct transactional state flip |
| upsertProductsBatch | internalMutation | Acceptable | Bounded batch writes |
| upsertSkusBatch | internalMutation | Acceptable | Bounded batch writes |
| cleanupSetSnapshot | internalMutation | Acceptable | Good indexed chunked cleanup |
| clearStuckSyncs | internalMutation | M6 | Whole-table maintenance scan over `catalogSets` |
| recordSetScopeCleanup | internalMutation | Acceptable | Simple indexed patch |
| purgeSetSnapshot | internalMutation | Acceptable | Good indexed chunked cleanup |
| claimSyncCandidates | internalMutation | H3 | Recomputes candidates by scanning all sets and rule scope |

### `convex/catalog/queries.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| getSetByKey | query | Acceptable | Proper indexed point lookup |
| listCategories | query | M2 | Full dataset returned to client for picker-style use |
| listSets | query | M2 | Full dataset returned and filtered client-side |
| listSyncCandidates | query | H3 | Whole-table scan + JS filtering/sorting |
| getByTcgplayerSku | query | Acceptable | Proper indexed lookup chain |
| inspectSetFinishMapping | query | Acceptable | Debug-style scoped query by set |
| hasCatalogSets | query | Acceptable | Cheap existence check |
| getSyncSummary | query | M3 | Broad summary read across multiple tables |

### `convex/catalog/sync.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| requestSetSync | internalAction | Acceptable | Thin wrapper |
| processSetSync | internalAction | H5 | Orchestrates very large per-set mutation work |
| refreshMetadata | internalAction | Acceptable | External I/O oriented |
| syncCatalogWindow | internalAction | H3 | Depends on expensive sync-candidate scan path |
| syncCatalogSet | internalAction | H5 | Thin wrapper around large per-set sync path |
| refreshMetadataNow | action | Acceptable | User-triggered wrapper |
| syncCatalogNow | action | H3 | User-triggered wrapper over expensive candidate path |

### `convex/orders/actions.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| exportPullSheets | action | M5 | Per-order `runQuery` fan-out |
| exportPackingSlips | action | M5 | Per-order `runQuery` fan-out |

### `convex/orders/mutations.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| upsertOrder | internalMutation | H4 | Ingest path inherits N+1 catalog-link lookups |
| backfillShippingMethods | mutation | M6 | Whole-table repair mutation |
| backfillCatalogLinks | internalMutation | H4 | Replays N+1 catalog-link lookups per order |
| upsertOrdersBatch | internalMutation | H4 | Batch wrapper still upserts one order at a time |
| backfillShipmentSummaries | mutation | Acceptable | Properly paginated repair mutation |
| setFulfillmentStatus | mutation | Acceptable | Small point mutation |
| backfillShippingStatuses | mutation | M6 | Whole-table repair mutation |
| backfillFulfillmentStatuses | mutation | M6 | Whole-table repair mutation |

### `convex/orders/queries.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| list | query | H6 | Unbounded public list used by historical shipment sync |
| listPage | query | Acceptable | Good use of pagination and created-at index |
| getById | query | Acceptable | Point lookup |

### `convex/orders/sync.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| syncActive | internalAction | H4 | Calls mutation once per order |
| syncRecent | internalAction | H4 | Calls mutation once per order |
| syncArchive | internalAction | Acceptable | Uses batch upserts, though helper cost remains |
| backfillCatalogLinks | internalAction | H4 | Replays catalog-link repair across all orders |

### `convex/pricing/admin.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| listTrackedSeriesPage | internalQuery | Acceptable | Proper pagination helper |
| listRulesPage | internalQuery | Acceptable | Proper pagination helper |
| listIssuesPage | internalQuery | Acceptable | Proper pagination helper |
| listActiveRuleJoinsPage | internalQuery | Acceptable | Proper indexed pagination helper |
| rebuildDashboardReadModels | action | L2 | Correct but expensive maintenance rebuild |

### `convex/pricing/mutations.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| enqueueRuleAffectedSetSyncs | internalMutation | Acceptable | Some scale cost, but mostly bounded by scheduler usage |
| refreshTrackedCoverageForSetMutation | internalMutation | H5 | Large per-set transactional workload |
| captureSeriesSnapshotsForSetMutation | internalMutation | H5 | Large per-set transactional workload |
| upsertSyncIssue | internalMutation | Acceptable | Proper indexed upsert |
| resolveSyncIssue | internalMutation | Acceptable | Proper indexed patch |
| backfillSyncIssues | mutation | M6 | Whole-table repair mutation |
| setIssueIgnored | mutation | Acceptable | Small point mutation |
| replaceDashboardStatsSnapshot | internalMutation | Acceptable | Small read-model write |
| rebuildRuleDashboardEntry | internalMutation | Acceptable | Small read-model rebuild unit |
| createManualProductRule | mutation | Acceptable | Reasonable point write + scheduler handoff |
| createSetRule | mutation | Acceptable | Reasonable point write + scheduler handoff |
| createCategoryRule | mutation | Acceptable | Reasonable point write + scheduler handoff |
| setRuleActive | mutation | Acceptable | Reasonable point write + scheduler handoff |
| deleteRule | mutation | Acceptable | Reasonable point delete + scheduler handoff |

### `convex/pricing/queries.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| listRules | query | M1 | Broad reads plus per-rule follow-up queries |
| getPricingStats | query | Acceptable | Proper indexed singleton read |
| listTrackedSeries | query | H1 | Full materialization plus JS pagination |
| getSeriesHistory | query | Acceptable | Scoped by series and optional effective-at range |
| searchCatalogProducts | query | Acceptable | Good search-index usage |
| listResolutionIssues | query | H2 | Full materialization plus JS pagination |
| listStaleTrackedSetKeys | internalQuery | H3 | Full active-series collect plus per-set point lookups |
| getSetRuleScope | internalQuery | Acceptable | Cheap wrapper, though helper underneath is part of H3 |

### `convex/pricing/sync.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| refreshTrackedCoverageForSet | internalAction | Acceptable | Thin wrapper |
| captureSeriesSnapshotsForSet | internalAction | Acceptable | Thin wrapper |
| processSetAfterCatalogSync | internalAction | Acceptable | Thin wrapper |
| enqueueStaleTrackedSetRefreshes | internalAction | H3 | Calls expensive stale-set selection path |

### `convex/shipments/actions.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| setFulfillmentStatus | action | L1 | Extra query/mutation hop layer |
| previewPurchase | action | L1 | Extra DB context hop before external I/O |
| purchaseLabel | action | L1 | Extra DB context hop before mutation |
| previewStandalonePurchase | action | Acceptable | Pure external quote flow |
| purchaseStandaloneLabel | action | Acceptable | External purchase with one internal mutation |
| refundLabel | action | L1 | Extra DB context hop before mutation |
| refundStandaloneLabel | action | L1 | Uses extra query wrapper for point read |

### `convex/shipments/mutations.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| upsertShipment | internalMutation | Acceptable | Per-order shipment collect is small in practice |
| backfillDerivedStatuses | mutation | M6 | Whole-table repair mutation |

### `convex/shipments/queries.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| list | query | Acceptable | Unbounded, but not currently used by UI |
| listRefreshCandidates | query | Acceptable | Bounded indexed `.take(...)` per status |
| getByOrderId | query | Acceptable | Proper indexed lookup |
| listStandalone | query | M4 | Unbounded shipment scan for reactive UI |
| getById | query | Acceptable | Point lookup |

### `convex/shipments/sync.ts`

| Function | Kind | Result | Notes |
| --- | --- | --- | --- |
| syncHistorical | internalAction | H6 | Loads full order list then filters in memory |
| refreshActiveStatuses | internalAction | Acceptable | Uses bounded refresh-candidate query |

## Helper-Level Notes

These are not part of the 96-function export count, but they materially affect the findings above.

- `convex/pricing/ruleScope.ts:listRuleScopedSetKeys`
  - central contributor to H3
  - loads all active rules and optionally all sets, then performs N+1 product lookups for legacy manual-product rules without denormalized set scope

- `convex/orders/mutations.ts:enrichOrderItemsWithCatalogLinks`
  - central contributor to H4
  - issues one lookup per distinct SKU and product ID

- `convex/pricing/dashboardReadModel.ts:refreshRuleDashboardFieldsForCategory`
- `convex/pricing/dashboardReadModel.ts:refreshRuleDashboardFieldsForSet`
- `convex/pricing/dashboardReadModel.ts:refreshRuleDashboardFieldsForProductKeys`
  - secondary contributors to M1 and M2
  - these are maintenance helpers, but some write paths call them in loops

## Acceptance Check

- All 96 exported Convex functions were classified and reviewed: yes
- Material React call sites were reviewed: yes
- High-severity and clearly incorrect patterns were captured with file/line evidence: yes
- Recommendations point to specific Convex alternatives: yes
- Correctness vs scale-only issues were separated: yes
- Stylistic-only nits were omitted: yes

## Sources

- Convex query functions: https://docs.convex.dev/functions/query-functions
- Convex mutation functions: https://docs.convex.dev/functions/mutation-functions
- Convex actions: https://docs.convex.dev/functions/actions
- Convex indexes: https://docs.convex.dev/database/reading-data/indexes/
- Convex pagination: https://docs.convex.dev/database/pagination
