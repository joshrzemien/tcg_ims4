import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'catalog:metadata',
  { hours: 24 },
  internal.catalog.sync.refreshMetadata,
)
crons.interval(
  'catalog:window',
  { minutes: 15 },
  internal.catalog.sync.syncCatalogWindow,
  { limit: 5 },
)
// TODO: After the initial backfill, revisit this cadence together with the per-run
// limit. The current 15m x 5 window keeps load bounded, but it cannot keep up with
// daily pricing/SKU churn across the full allowed catalog.
crons.interval(
  'orders:active',
  { minutes: 15 },
  internal.orders.sync.syncActive,
)
crons.interval('orders:recent', { hours: 1 }, internal.orders.sync.syncRecent)
crons.interval(
  'orders:archive',
  { hours: 24 },
  internal.orders.sync.syncArchive,
)
crons.interval(
  'shipments:status',
  { hours: 1 },
  internal.shipments.sync.refreshActiveStatuses,
  {},
)

export default crons
