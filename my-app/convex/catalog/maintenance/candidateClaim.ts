import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { getAllowedCatalogCategoryIds } from '../config'
import { loadSyncCandidates } from '../syncCandidates'
import { getSyncPriority } from '../syncState'

export const claimSyncCandidates = internalMutation({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, { limit }) => {
    const maxResults = Math.max(1, Math.min(limit, 100))
    const allowedCategoryIds = getAllowedCatalogCategoryIds()
    const now = Date.now()
    const candidates = await loadSyncCandidates(ctx, {
      limit: maxResults,
      allowedCategoryIds,
      now,
    })

    for (const candidate of candidates) {
      await ctx.db.patch('catalogSets', candidate._id, {
        syncStatus: 'syncing',
        currentSyncStartedAt: now,
        nextSyncAttemptAt: undefined,
        lastSyncError: undefined,
        updatedAt: now,
      })
    }

    return candidates.map((set) => ({
      key: set.key,
      syncPriority: getSyncPriority(set),
    }))
  },
})
