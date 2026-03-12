import { mutation } from '../../_generated/server'
import { applyDashboardStatsDelta } from '../dashboardReadModel'
import {
  buildSyncIssueKey,
  isActiveUnignoredIssue,
} from '../shared/keys'

export const backfillSyncIssues = mutation({
  args: {},
  handler: async (ctx) => {
    const erroredSets = await ctx.db.query('catalogSets').collect()
    let insertedOrUpdated = 0
    let totalIssuesDelta = 0
    let totalActiveIssuesDelta = 0

    for (const set of erroredSets) {
      if (set.syncStatus !== 'error' && set.pricingSyncStatus !== 'error') {
        continue
      }

      const key = buildSyncIssueKey(set.key)
      const existing = await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique()

      const details = {
        setName: set.name,
        message: set.lastPricingSyncError ?? set.lastSyncError ?? 'Unknown sync error',
        syncStage:
          set.pricingSyncStatus === 'error' ? 'pricing' : 'catalog',
        syncStatus: set.syncStatus,
        pricingSyncStatus: set.pricingSyncStatus,
      }

      if (existing) {
        const wasActiveUnignored = isActiveUnignoredIssue(existing)
        await ctx.db.patch('pricingResolutionIssues', existing._id, {
          details,
          lastSeenAt: set.updatedAt,
          active: true,
        })
        if (!wasActiveUnignored && !existing.ignoredAt) {
          totalActiveIssuesDelta += 1
        }
      } else {
        await ctx.db.insert('pricingResolutionIssues', {
          key,
          catalogProductKey: '',
          seriesKey: '',
          setKey: set.key,
          categoryKey: set.categoryKey,
          issueType: 'sync_error',
          details,
          firstSeenAt: set.updatedAt,
          lastSeenAt: set.updatedAt,
          occurrenceCount: set.consecutiveSyncFailures ?? 1,
          active: true,
          isIgnored: false,
          ignoredAt: undefined,
        })
        totalIssuesDelta += 1
        totalActiveIssuesDelta += 1
      }

      insertedOrUpdated += 1
    }

    if (totalIssuesDelta !== 0 || totalActiveIssuesDelta !== 0) {
      await applyDashboardStatsDelta(ctx, {
        totalIssues: totalIssuesDelta,
        totalActiveIssues: totalActiveIssuesDelta,
      })
    }

    return { insertedOrUpdated }
  },
})
