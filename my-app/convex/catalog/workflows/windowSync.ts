import { v } from 'convex/values'
import { action, internalAction } from '../../_generated/server'
import { api, internal } from '../../_generated/api'
import { refreshCatalogMetadata } from './metadataRefresh'
import type { ActionCtx } from '../../_generated/server'

const DEFAULT_SYNC_WINDOW = 5
const STUCK_SYNC_THRESHOLD_MS = 30 * 60 * 1000

type CatalogWindowResult = {
  attempted: number
  scheduled: number
  metadataRefreshed: boolean
  queuedSetKeys: Array<string>
}

async function runCatalogWindow(
  ctx: ActionCtx,
  limit: number | undefined,
): Promise<CatalogWindowResult> {
  const maxSets = Math.max(1, Math.min(limit ?? DEFAULT_SYNC_WINDOW, 25))

  await ctx.runMutation(internal.catalog.mutations.clearStuckSyncs, {
    thresholdMs: STUCK_SYNC_THRESHOLD_MS,
  })

  let metadataRefreshed = false
  const hasCatalogSets = await ctx.runQuery(
    api.catalog.queries.hasCatalogSets,
    {},
  )
  if (!hasCatalogSets) {
    await refreshCatalogMetadata(ctx)
    metadataRefreshed = true
  }

  const candidates: Array<{ key: string; syncPriority: number }> =
    await ctx.runMutation(internal.catalog.mutations.claimSyncCandidates, {
      limit: maxSets,
    })

  const queuedSetKeys: Array<string> = []

  for (const candidate of candidates) {
    await ctx.scheduler.runAfter(0, internal.catalog.sync.processSetSync, {
      setKey: candidate.key,
      mode: 'full',
      reason: 'catalog_window',
    })
    queuedSetKeys.push(candidate.key)
  }

  return {
    attempted: candidates.length,
    scheduled: queuedSetKeys.length,
    metadataRefreshed,
    queuedSetKeys,
  }
}

export const syncCatalogWindow = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<CatalogWindowResult> => {
    return await runCatalogWindow(ctx, limit)
  },
})

export const syncCatalogNow = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<CatalogWindowResult> => {
    return await runCatalogWindow(ctx, limit)
  },
})
