import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'

const TRACKED_SET_STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000
const DEFAULT_STALE_REFRESH_LIMIT = 25

type CoverageResult = {
  setKey: string
  series: number
  joins: number
}

type SnapshotResult = {
  setKey: string
  series: number
  insertedHistory: number
}

type EnqueueStaleTrackedSetRefreshesResult = {
  scheduled: number
  setKeys: Array<string>
}

type RequestSetSyncResult = {
  setKey: string
  scheduled: boolean
  mode: 'full' | 'pricing_only'
  reason?: string
}

type ProcessSetAfterCatalogSyncResult = RequestSetSyncResult & {
  syncStartedAt: number
}

export const refreshTrackedCoverageForSet = internalAction({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }): Promise<CoverageResult> => {
    return await ctx.runAction(
      internal.pricing.mutations.refreshTrackedCoverageForSetMutation,
      { setKey },
    )
  },
})

export const captureSeriesSnapshotsForSet = internalAction({
  args: {
    setKey: v.string(),
    capturedAt: v.number(),
  },
  handler: async (ctx, { setKey, capturedAt }): Promise<SnapshotResult> => {
    return await ctx.runAction(
      internal.pricing.mutations.captureSeriesSnapshotsForSetMutation,
      { setKey, capturedAt },
    )
  },
})

export const processSetAfterCatalogSync = internalAction({
  args: {
    setKey: v.string(),
    syncStartedAt: v.number(),
  },
  handler: async (
    ctx,
    { setKey, syncStartedAt },
  ): Promise<ProcessSetAfterCatalogSyncResult> => {
    const result: RequestSetSyncResult = await ctx.runAction(
      internal.catalog.sync.requestSetSync,
      {
        setKey,
        mode: 'pricing_only',
        reason: 'processSetAfterCatalogSync',
      },
    )

    return {
      syncStartedAt,
      ...result,
    }
  },
})

export const enqueueStaleTrackedSetRefreshes = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { limit },
  ): Promise<EnqueueStaleTrackedSetRefreshesResult> => {
    const staleSets: Array<{
      setKey: string
      lastSyncedAt?: number
      ageMs: number
    }> = await ctx.runQuery(internal.pricing.queries.listStaleTrackedSetKeys, {
      thresholdMs: TRACKED_SET_STALE_THRESHOLD_MS,
      limit: Math.max(1, Math.min(limit ?? DEFAULT_STALE_REFRESH_LIMIT, 100)),
    })

    const setKeys: Array<string> = []

    for (const staleSet of staleSets) {
      const result = await ctx.runAction(internal.catalog.sync.requestSetSync, {
        setKey: staleSet.setKey,
        mode: 'full',
        reason: 'pricing_tracked_sets',
      })

      if (result.scheduled) {
        setKeys.push(staleSet.setKey)
      }
    }

    return {
      scheduled: setKeys.length,
      setKeys,
    }
  },
})
