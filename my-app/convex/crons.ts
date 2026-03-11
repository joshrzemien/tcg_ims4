import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Use explicit UTC cron times so jobs with the same cadence do not bunch up
// based on deploy time.
crons.cron(
  'catalog:metadata',
  '5 3 * * *',
  internal.catalog.sync.refreshMetadata,
)
crons.cron(
  'catalog:window',
  '1,16,31,46 * * * *',
  internal.catalog.sync.syncCatalogWindow,
  { limit: 5 },
)
// TODO: After the initial backfill, revisit this cadence together with the per-run
// limit. The current 15m x 5 window keeps load bounded, but it cannot keep up with
// daily pricing/SKU churn across the full allowed catalog.
crons.cron(
  'orders:active',
  '8,23,38,53 * * * *',
  internal.orders.sync.syncActive,
)
crons.cron('orders:recent', '28 * * * *', internal.orders.sync.syncRecent)
crons.cron(
  'orders:archive',
  '35 4 * * *',
  internal.orders.sync.syncArchive,
)
crons.cron(
  'shipments:status',
  '13 * * * *',
  internal.shipments.sync.refreshActiveStatuses,
  {},
)

export default crons
