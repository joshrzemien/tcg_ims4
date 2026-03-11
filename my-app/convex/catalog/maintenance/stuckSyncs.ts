import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { normalizeOptionalString } from '../shared/syncHelpers'

export const clearStuckSyncs = internalMutation({
  args: {
    thresholdMs: v.number(),
  },
  handler: async (ctx, { thresholdMs }) => {
    const now = Date.now()
    const sets = await ctx.db.query('catalogSets').collect()
    let reset = 0

    for (const set of sets) {
      const catalogStuck =
        set.syncStatus === 'syncing' &&
        typeof set.currentSyncStartedAt === 'number' &&
        now - set.currentSyncStartedAt >= thresholdMs
      const pricingStuck =
        set.pricingSyncStatus === 'syncing' &&
        typeof set.currentPricingSyncStartedAt === 'number' &&
        now - set.currentPricingSyncStartedAt >= thresholdMs

      if (!catalogStuck && !pricingStuck) {
        continue
      }

      await ctx.db.patch('catalogSets', set._id, {
        syncStatus: 'pending',
        currentSyncStartedAt: undefined,
        pricingSyncStatus: 'idle',
        currentPricingSyncStartedAt: undefined,
        lastSyncError: normalizeOptionalString(set.lastSyncError),
        lastPricingSyncError: normalizeOptionalString(set.lastPricingSyncError),
        updatedAt: now,
      })
      reset += 1
    }

    return { reset }
  },
})
