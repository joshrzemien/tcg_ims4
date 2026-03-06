import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

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
