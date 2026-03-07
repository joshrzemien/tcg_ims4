import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { getAllowedCatalogCategoryIds } from './config'
import {
  compareSyncCandidates,
  getSyncPriority,
  isSyncCandidateEligible,
} from './syncState'

const SYNC_RETRY_BACKOFF_MS = [
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function latestSourceTimestamp(set: {
  modifiedOn?: string
  productsModifiedAt?: string
  pricingModifiedAt?: string
  skusModifiedAt?: string
}): number | undefined {
  const timestamps = [
    toTimestamp(set.modifiedOn),
    toTimestamp(set.productsModifiedAt),
    toTimestamp(set.pricingModifiedAt),
    toTimestamp(set.skusModifiedAt),
  ].filter((value): value is number => typeof value === 'number')

  if (timestamps.length === 0) {
    return undefined
  }

  return Math.max(...timestamps)
}

function getRetryDelayMs(consecutiveFailureCount: number): number {
  const index = Math.max(
    0,
    Math.min(consecutiveFailureCount - 1, SYNC_RETRY_BACKOFF_MS.length - 1),
  )
  return SYNC_RETRY_BACKOFF_MS[index]
}

function hasSetSourceChanged(
  existing: {
    modifiedOn?: string
    productsModifiedAt?: string
    pricingModifiedAt?: string
    skusModifiedAt?: string
    productCount: number
    skuCount: number
  },
  incoming: {
    modifiedOn?: string
    productsModifiedAt?: string
    pricingModifiedAt?: string
    skusModifiedAt?: string
    productCount: number
    skuCount: number
  },
): boolean {
  return (
    existing.modifiedOn !== incoming.modifiedOn ||
    existing.productsModifiedAt !== incoming.productsModifiedAt ||
    existing.pricingModifiedAt !== incoming.pricingModifiedAt ||
    existing.skusModifiedAt !== incoming.skusModifiedAt ||
    existing.productCount !== incoming.productCount ||
    existing.skuCount !== incoming.skuCount
  )
}

export const upsertCategoriesBatch = internalMutation({
  args: {
    categories: v.array(v.any()),
  },
  handler: async (ctx, { categories }) => {
    let inserted = 0
    let updated = 0

    for (const category of categories) {
      const existing = await ctx.db
        .query('catalogCategories')
        .withIndex('by_key', (q) => q.eq('key', category.key))
        .unique()

      if (existing) {
        await ctx.db.patch('catalogCategories', existing._id, {
          tcgtrackingCategoryId: category.tcgtrackingCategoryId,
          name: category.name,
          displayName: category.displayName,
          productCount: category.productCount,
          setCount: category.setCount,
          apiUrl: category.apiUrl,
          updatedAt: category.updatedAt,
        })
        updated += 1
      } else {
        await ctx.db.insert('catalogCategories', category)
        inserted += 1
      }
    }

    return {
      inserted,
      updated,
    }
  },
})

export const upsertSetsBatch = internalMutation({
  args: {
    sets: v.array(v.any()),
  },
  handler: async (ctx, { sets }) => {
    let inserted = 0
    let updated = 0

    for (const incoming of sets) {
      const existing = await ctx.db
        .query('catalogSets')
        .withIndex('by_key', (q) => q.eq('key', incoming.key))
        .unique()

      const nextUpdatedAt = incoming.updatedAt
      const sourceTimestamp = latestSourceTimestamp(incoming)
      const isStale =
        typeof sourceTimestamp === 'number' &&
        typeof existing?.lastSyncedAt === 'number' &&
        sourceTimestamp > existing.lastSyncedAt
      const hasSourceChanged = existing
        ? hasSetSourceChanged(existing, incoming)
        : false

      if (existing) {
        const shouldResetSyncState =
          isStale ||
          (!existing.lastSyncedAt && existing.syncStatus !== 'error') ||
          (existing.syncStatus === 'error' && hasSourceChanged)

        await ctx.db.patch('catalogSets', existing._id, {
          categoryKey: incoming.categoryKey,
          tcgtrackingCategoryId: incoming.tcgtrackingCategoryId,
          categoryName: incoming.categoryName,
          categoryDisplayName: incoming.categoryDisplayName,
          tcgtrackingSetId: incoming.tcgtrackingSetId,
          name: incoming.name,
          abbreviation: incoming.abbreviation,
          isSupplemental: incoming.isSupplemental,
          publishedOn: incoming.publishedOn,
          modifiedOn: incoming.modifiedOn,
          productCount: incoming.productCount,
          skuCount: incoming.skuCount,
          productsModifiedAt: incoming.productsModifiedAt,
          pricingModifiedAt: incoming.pricingModifiedAt,
          skusModifiedAt: incoming.skusModifiedAt,
          ...(existing.syncStatus === 'syncing'
            ? {}
            : shouldResetSyncState
              ? {
                  syncStatus: 'pending',
                  nextSyncAttemptAt: undefined,
                  consecutiveSyncFailures: undefined,
                  lastSyncError: undefined,
                }
              : {
                  syncStatus: existing.syncStatus,
                  nextSyncAttemptAt: existing.nextSyncAttemptAt,
                  consecutiveSyncFailures: existing.consecutiveSyncFailures,
                  lastSyncError: normalizeOptionalString(existing.lastSyncError),
                }),
          updatedAt: nextUpdatedAt,
        })
        updated += 1
      } else {
        await ctx.db.insert('catalogSets', {
          ...incoming,
          syncStatus: 'pending',
        })
        inserted += 1
      }
    }

    return {
      inserted,
      updated,
    }
  },
})

export const markSetSyncStarted = internalMutation({
  args: {
    setKey: v.string(),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { setKey, syncStartedAt }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'syncing',
      currentSyncStartedAt: syncStartedAt,
      nextSyncAttemptAt: undefined,
      lastSyncError: undefined,
      updatedAt: syncStartedAt,
    })
  },
})

export const markSetSyncCompleted = internalMutation({
  args: {
    setKey: v.string(),
    completedAt: v.number(),
  },
  handler: async (ctx, { setKey, completedAt }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'ready',
      currentSyncStartedAt: undefined,
      lastSyncedAt: completedAt,
      lastSyncError: undefined,
      nextSyncAttemptAt: undefined,
      consecutiveSyncFailures: undefined,
      updatedAt: completedAt,
    })
  },
})

export const markSetSyncFailed = internalMutation({
  args: {
    setKey: v.string(),
    failedAt: v.number(),
    message: v.string(),
  },
  handler: async (ctx, { setKey, failedAt, message }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const consecutiveSyncFailures = (existing.consecutiveSyncFailures ?? 0) + 1

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'error',
      currentSyncStartedAt: undefined,
      lastSyncError: message,
      nextSyncAttemptAt: failedAt + getRetryDelayMs(consecutiveSyncFailures),
      consecutiveSyncFailures,
      updatedAt: failedAt,
    })
  },
})

export const upsertProductsBatch = internalMutation({
  args: {
    products: v.array(v.any()),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { products, syncStartedAt }) => {
    let inserted = 0
    let updated = 0

    for (const incoming of products) {
      const existing = await ctx.db
        .query('catalogProducts')
        .withIndex('by_key', (q) => q.eq('key', incoming.key))
        .unique()

      const nextRecord = {
        ...incoming,
        lastIngestedAt: syncStartedAt,
        updatedAt: syncStartedAt,
      }

      if (existing) {
        await ctx.db.patch('catalogProducts', existing._id, nextRecord)
        updated += 1
      } else {
        await ctx.db.insert('catalogProducts', nextRecord)
        inserted += 1
      }
    }

    return {
      inserted,
      updated,
    }
  },
})

export const upsertSkusBatch = internalMutation({
  args: {
    skus: v.array(v.any()),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { skus, syncStartedAt }) => {
    let inserted = 0
    let updated = 0

    for (const incoming of skus) {
      const existing = await ctx.db
        .query('catalogSkus')
        .withIndex('by_key', (q) => q.eq('key', incoming.key))
        .unique()

      const nextRecord = {
        ...incoming,
        lastIngestedAt: syncStartedAt,
        updatedAt: syncStartedAt,
      }

      if (existing) {
        await ctx.db.patch('catalogSkus', existing._id, nextRecord)
        updated += 1
      } else {
        await ctx.db.insert('catalogSkus', nextRecord)
        inserted += 1
      }
    }

    return {
      inserted,
      updated,
    }
  },
})

export const cleanupSetSnapshot = internalMutation({
  args: {
    setKey: v.string(),
    syncStartedAt: v.number(),
    productLimit: v.number(),
    skuLimit: v.number(),
  },
  handler: async (ctx, { setKey, syncStartedAt, productLimit, skuLimit }) => {
    const products = await ctx.db
      .query('catalogProducts')
      .withIndex('by_setKey_lastIngestedAt', (q) =>
        q.eq('setKey', setKey).lt('lastIngestedAt', syncStartedAt),
      )
      .take(productLimit)
    const skus = await ctx.db
      .query('catalogSkus')
      .withIndex('by_setKey_lastIngestedAt', (q) =>
        q.eq('setKey', setKey).lt('lastIngestedAt', syncStartedAt),
      )
      .take(skuLimit)

    let deletedProducts = 0
    let deletedSkus = 0

    for (const product of products) {
      await ctx.db.delete('catalogProducts', product._id)
      deletedProducts += 1
    }

    for (const sku of skus) {
      await ctx.db.delete('catalogSkus', sku._id)
      deletedSkus += 1
    }

    return {
      deletedProducts,
      deletedSkus,
      hasMoreProducts: products.length === productLimit,
      hasMoreSkus: skus.length === skuLimit,
    }
  },
})

export const clearStuckSyncs = internalMutation({
  args: {
    thresholdMs: v.number(),
  },
  handler: async (ctx, { thresholdMs }) => {
    const now = Date.now()
    // TODO: Replace this full catalogSets scan with indexed sync-state lookups once the
    // catalog shape stabilizes. Running collect() every window does unnecessary work as
    // the backfill grows.
    const sets = await ctx.db.query('catalogSets').collect()
    let reset = 0

    for (const set of sets) {
      if (set.syncStatus !== 'syncing') {
        continue
      }

      if (
        typeof set.currentSyncStartedAt === 'number' &&
        now - set.currentSyncStartedAt < thresholdMs
      ) {
        continue
      }

      await ctx.db.patch('catalogSets', set._id, {
        syncStatus: 'pending',
        currentSyncStartedAt: undefined,
        lastSyncError: normalizeOptionalString(set.lastSyncError),
        updatedAt: now,
      })
      reset += 1
    }

    return { reset }
  },
})

export const claimSyncCandidates = internalMutation({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, { limit }) => {
    const maxResults = Math.max(1, Math.min(limit, 100))
    const allowedCategoryIds = getAllowedCatalogCategoryIds()
    const now = Date.now()
    // TODO: Move candidate selection off a full table scan + in-memory sort. This is
    // fine for bootstrapping, but it becomes a recurring tax on every sync window.
    const sets = await ctx.db.query('catalogSets').collect()
    const candidates = sets
      .filter((set) => isSyncCandidateEligible(set, now, allowedCategoryIds))
      .sort(compareSyncCandidates)
      .slice(0, maxResults)

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
