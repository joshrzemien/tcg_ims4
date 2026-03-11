import { v } from 'convex/values'
import { api, internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { chunkArray } from '../../lib/collections'
import { filterSetPayloadToSyncScope } from '../syncPolicy'
import { mapProducts, mapSkus } from '../shared/mappers'
import { fetchCatalogSetPayload } from '../sources/tcgtracking'
import type { ActionCtx } from '../../_generated/server'
import type { SetSyncMode } from '../syncModes'

const PRODUCT_BATCH_SIZE = 100
const SKU_BATCH_SIZE = 500
const CLEANUP_PRODUCT_BATCH_SIZE = 250
const CLEANUP_SKU_BATCH_SIZE = 1000

type SyncSetSuccess = {
  setKey: string
  requestedMode: SetSyncMode
  processedMode: SetSyncMode
  productCount: number
  skuCount: number
  cleanup?: { deletedProducts: number; deletedSkus: number }
  coverage: { setKey: string; series: number; joins: number }
  snapshots: { setKey: string; series: number; insertedHistory: number }
  completedAt: number
}

type RequestSetSyncResult = {
  setKey: string
  scheduled: boolean
  mode: SetSyncMode
  reason?: string
}

async function loadSetByKey(ctx: ActionCtx, setKey: string) {
  const set = await ctx.runQuery(api.catalog.queries.getSetByKey, { setKey })
  if (!set) {
    throw new Error(`Catalog set not found: ${setKey}`)
  }

  return set
}

async function cleanupSetSnapshot(
  ctx: ActionCtx,
  setKey: string,
  syncStartedAt: number,
) {
  let deletedProducts = 0
  let deletedSkus = 0
  let hasMoreProducts = true
  let hasMoreSkus = true

  while (hasMoreProducts || hasMoreSkus) {
    const result = await ctx.runMutation(
      internal.catalog.mutations.cleanupSetSnapshot,
      {
        setKey,
        syncStartedAt,
        productLimit: CLEANUP_PRODUCT_BATCH_SIZE,
        skuLimit: CLEANUP_SKU_BATCH_SIZE,
      },
    )

    deletedProducts += result.deletedProducts
    deletedSkus += result.deletedSkus
    hasMoreProducts = result.hasMoreProducts
    hasMoreSkus = result.hasMoreSkus
  }

  return {
    deletedProducts,
    deletedSkus,
  }
}

async function purgeSetSnapshot(ctx: ActionCtx, setKey: string) {
  let deletedProducts = 0
  let deletedSkus = 0
  let hasMoreProducts = true
  let hasMoreSkus = true

  while (hasMoreProducts || hasMoreSkus) {
    const result = await ctx.runMutation(
      internal.catalog.mutations.purgeSetSnapshot,
      {
        setKey,
        productLimit: CLEANUP_PRODUCT_BATCH_SIZE,
        skuLimit: CLEANUP_SKU_BATCH_SIZE,
      },
    )

    deletedProducts += result.deletedProducts
    deletedSkus += result.deletedSkus
    hasMoreProducts = result.hasMoreProducts
    hasMoreSkus = result.hasMoreSkus
  }

  return {
    deletedProducts,
    deletedSkus,
  }
}

export async function requestSetSyncInternal(
  ctx: ActionCtx,
  params: {
    setKey: string
    mode: SetSyncMode
    reason?: string
  },
): Promise<RequestSetSyncResult> {
  const request = await ctx.runMutation(
    internal.catalog.mutations.requestSetSync,
    params,
  )

  if (request.scheduled) {
    await ctx.scheduler.runAfter(0, internal.catalog.sync.processSetSync, {
      setKey: params.setKey,
      mode: params.mode,
      reason: params.reason,
    })
  }

  return {
    setKey: params.setKey,
    scheduled: request.scheduled,
    mode: request.mode,
    reason: params.reason,
  }
}

export async function processSetSyncInternal(
  ctx: ActionCtx,
  params: {
    setKey: string
    mode: SetSyncMode
    reason?: string
  },
): Promise<SyncSetSuccess> {
  const { setKey, mode } = params
  const set = await loadSetByKey(ctx, setKey)
  const ruleScope = await ctx.runQuery(
    internal.pricing.queries.getSetRuleScope,
    {
      setKey,
    },
  )
  const setInRuleScope = ruleScope.inRuleScope
  const processedMode: SetSyncMode =
    mode === 'pricing_only' && typeof set.lastSyncedAt !== 'number'
      ? 'full'
      : mode

  let productCount = 0
  let skuCount = 0
  let cleanup: { deletedProducts: number; deletedSkus: number } | undefined
  let completedAt = Date.now()
  let coverage = { setKey, series: 0, joins: 0 }
  let snapshots = { setKey, series: 0, insertedHistory: 0 }

  try {
    if (processedMode === 'full' && setInRuleScope) {
      const syncStartedAt = Date.now()
      await ctx.runMutation(internal.catalog.mutations.markSetSyncStarted, {
        setKey,
        syncStartedAt,
      })

      try {
        const rawPayload = await fetchCatalogSetPayload(
          set.tcgtrackingCategoryId,
          set.tcgtrackingSetId,
        )
        const payload = filterSetPayloadToSyncScope(rawPayload)
        const products = mapProducts(set, payload)
        const skus = mapSkus(set, payload)

        for (const batch of chunkArray(products, PRODUCT_BATCH_SIZE)) {
          await ctx.runMutation(
            internal.catalog.mutations.upsertProductsBatch,
            {
              products: batch,
              syncStartedAt,
            },
          )
        }

        for (const batch of chunkArray(skus, SKU_BATCH_SIZE)) {
          await ctx.runMutation(internal.catalog.mutations.upsertSkusBatch, {
            skus: batch,
            syncStartedAt,
          })
        }

        cleanup = await cleanupSetSnapshot(ctx, setKey, syncStartedAt)
        productCount = products.length
        skuCount = skus.length
        completedAt = Date.now()

        await ctx.runMutation(internal.catalog.mutations.markSetSyncCompleted, {
          setKey,
          completedAt,
          syncedProductCount: productCount,
          syncedSkuCount: skuCount,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const failedAt = Date.now()
        await ctx.runMutation(internal.catalog.mutations.markSetSyncFailed, {
          setKey,
          failedAt,
          message,
        })
        await ctx.runMutation(
          internal.catalog.mutations.markPricingSyncFailed,
          {
            setKey,
            failedAt,
            message,
          },
        )
        await ctx.runMutation(internal.pricing.mutations.upsertSyncIssue, {
          setKey,
          failedAt,
          message,
          syncStage: 'catalog',
        })
        throw error
      }
    }

    const pricingStartedAt = Date.now()
    await ctx.runMutation(internal.catalog.mutations.markPricingSyncStarted, {
      setKey,
      syncStartedAt: pricingStartedAt,
    })

    try {
      coverage = await ctx.runAction(
        internal.pricing.mutations.refreshTrackedCoverageForSetMutation,
        { setKey },
      )
      snapshots = await ctx.runAction(
        internal.pricing.mutations.captureSeriesSnapshotsForSetMutation,
        {
          setKey,
          capturedAt: Date.now(),
        },
      )
      completedAt = Date.now()

      await ctx.runMutation(
        internal.catalog.mutations.markPricingSyncCompleted,
        {
          setKey,
          completedAt,
        },
      )
      await ctx.runMutation(internal.pricing.mutations.resolveSyncIssue, {
        setKey,
        resolvedAt: completedAt,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedAt = Date.now()
      await ctx.runMutation(internal.catalog.mutations.markPricingSyncFailed, {
        setKey,
        failedAt,
        message,
      })
      await ctx.runMutation(internal.pricing.mutations.upsertSyncIssue, {
        setKey,
        failedAt,
        message,
        syncStage: 'pricing',
      })
      throw error
    }

    if (!setInRuleScope) {
      cleanup = await purgeSetSnapshot(ctx, setKey)
      productCount = 0
      skuCount = 0
      completedAt = Date.now()

      await ctx.runMutation(internal.catalog.mutations.recordSetScopeCleanup, {
        setKey,
        cleanedAt: completedAt,
      })
    }
  } finally {
    const pending = await ctx.runMutation(
      internal.catalog.mutations.consumePendingSyncMode,
      { setKey },
    )

    if (pending.mode) {
      await ctx.scheduler.runAfter(0, internal.catalog.sync.processSetSync, {
        setKey,
        mode: pending.mode,
        reason: 'pending_follow_up',
      })
    }
  }

  return {
    setKey,
    requestedMode: mode,
    processedMode,
    productCount,
    skuCount,
    cleanup,
    coverage,
    snapshots,
    completedAt,
  }
}

export const requestSetSync = internalAction({
  args: {
    setKey: v.string(),
    mode: v.union(v.literal('full'), v.literal('pricing_only')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RequestSetSyncResult> => {
    return await requestSetSyncInternal(ctx, args)
  },
})

export const processSetSync = internalAction({
  args: {
    setKey: v.string(),
    mode: v.union(v.literal('full'), v.literal('pricing_only')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SyncSetSuccess> => {
    return await processSetSyncInternal(ctx, args)
  },
})

export const syncCatalogSet = internalAction({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }): Promise<SyncSetSuccess> => {
    return await processSetSyncInternal(ctx, {
      setKey,
      mode: 'full',
      reason: 'syncCatalogSet',
    })
  },
})
