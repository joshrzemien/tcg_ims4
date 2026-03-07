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

type ProcessSetAfterCatalogSyncResult = {
  setKey: string
  syncStartedAt: number
  coverage: CoverageResult
  snapshots: SnapshotResult
}

type EnqueueStaleTrackedSetRefreshesResult = {
  scheduled: number
  setKeys: Array<string>
}

export const refreshTrackedCoverageForSet = internalAction({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }): Promise<CoverageResult> => {
    return await ctx.runMutation(
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
    return await ctx.runMutation(
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
  handler: async (ctx, { setKey, syncStartedAt }): Promise<ProcessSetAfterCatalogSyncResult> => {
    const coverage: CoverageResult = await ctx.runMutation(
      internal.pricing.mutations.refreshTrackedCoverageForSetMutation,
      { setKey },
    )
    const snapshots: SnapshotResult = await ctx.runMutation(
      internal.pricing.mutations.captureSeriesSnapshotsForSetMutation,
      {
        setKey,
        capturedAt: Date.now(),
      },
    )

    return {
      setKey,
      syncStartedAt,
      coverage,
      snapshots,
    }
  },
})

export const enqueueStaleTrackedSetRefreshes = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<EnqueueStaleTrackedSetRefreshesResult> => {
    const staleSets: Array<{ setKey: string; lastSyncedAt?: number; ageMs: number }> =
      await ctx.runQuery(internal.pricing.queries.listStaleTrackedSetKeys, {
        thresholdMs: TRACKED_SET_STALE_THRESHOLD_MS,
        limit: Math.max(1, Math.min(limit ?? DEFAULT_STALE_REFRESH_LIMIT, 100)),
      })

    for (const staleSet of staleSets) {
      await ctx.scheduler.runAfter(0, internal.catalog.sync.syncCatalogSet, {
        setKey: staleSet.setKey,
      })
    }

    return {
      scheduled: staleSets.length,
      setKeys: staleSets.map((entry: { setKey: string }) => entry.setKey),
    }
  },
})
