import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import {
  refreshRuleDashboardFieldsForCategory,
  refreshRuleDashboardFieldsForProductKeys,
  refreshRuleDashboardFieldsForSet,
} from '../pricing/dashboardReadModel'
import { listRuleScopedSetKeys } from '../pricing/ruleScope'
import { getAllowedCatalogCategoryIds } from './config'
import { pickHigherPrioritySyncMode } from './syncModes'
import {
  compareSyncCandidates,
  getSyncPriority,
  isSyncCandidateEligible,
  needsRuleScopeCleanup,
} from './syncState'

const SYNC_RETRY_BACKOFF_MS = [
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]

const setSyncModeValidator = v.union(
  v.literal('full'),
  v.literal('pricing_only'),
)

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

function needsPolicyResync(existing: {
  syncedProductCount?: number
  syncedSkuCount?: number
  pricingSyncStatus?: 'idle' | 'syncing' | 'error'
}) {
  return (
    typeof existing.syncedProductCount !== 'number' ||
    typeof existing.syncedSkuCount !== 'number' ||
    typeof existing.pricingSyncStatus !== 'string'
  )
}

function isSetProcessing(existing: {
  syncStatus: 'pending' | 'syncing' | 'ready' | 'error'
  pricingSyncStatus?: 'idle' | 'syncing' | 'error'
}) {
  return (
    existing.syncStatus === 'syncing' ||
    existing.pricingSyncStatus === 'syncing'
  )
}

export const upsertCategoriesBatch = internalMutation({
  args: {
    categories: v.array(v.any()),
  },
  handler: async (ctx, { categories }) => {
    let inserted = 0
    let updated = 0
    const touchedCategoryKeys = new Set<string>()

    for (const category of categories) {
      touchedCategoryKeys.add(category.key)
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

    for (const categoryKey of touchedCategoryKeys) {
      await refreshRuleDashboardFieldsForCategory(ctx, categoryKey)
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
    const touchedSetKeys = new Set<string>()
    const touchedCategoryKeys = new Set<string>()
    const touchedProductKeys = new Set<string>()

    for (const incoming of sets) {
      touchedSetKeys.add(incoming.key)
      touchedCategoryKeys.add(incoming.categoryKey)
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
          needsPolicyResync(existing) ||
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
                  syncStatus: 'pending' as const,
                  nextSyncAttemptAt: undefined,
                  consecutiveSyncFailures: undefined,
                  lastSyncError: undefined,
                }
              : {
                  syncStatus: existing.syncStatus,
                  nextSyncAttemptAt: existing.nextSyncAttemptAt,
                  consecutiveSyncFailures: existing.consecutiveSyncFailures,
                  lastSyncError: normalizeOptionalString(
                    existing.lastSyncError,
                  ),
                }),
          pricingSyncStatus: existing.pricingSyncStatus ?? 'idle',
          currentPricingSyncStartedAt: existing.currentPricingSyncStartedAt,
          lastPricingSyncedAt: existing.lastPricingSyncedAt,
          lastPricingSyncError: normalizeOptionalString(
            existing.lastPricingSyncError,
          ),
          pendingSyncMode: existing.pendingSyncMode,
          syncedProductCount: existing.syncedProductCount,
          syncedSkuCount: existing.syncedSkuCount,
          updatedAt: nextUpdatedAt,
        })
        updated += 1
      } else {
        await ctx.db.insert('catalogSets', {
          ...incoming,
          syncStatus: 'pending',
          pricingSyncStatus: 'idle',
        })
        inserted += 1
      }
    }

    for (const setKey of touchedSetKeys) {
      await refreshRuleDashboardFieldsForSet(ctx, setKey)
      const products = await ctx.db
        .query('catalogProducts')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect()
      for (const product of products) {
        touchedProductKeys.add(product.key)
      }
    }
    for (const categoryKey of touchedCategoryKeys) {
      await refreshRuleDashboardFieldsForCategory(ctx, categoryKey)
    }
    await refreshRuleDashboardFieldsForProductKeys(
      ctx,
      [...touchedProductKeys],
    )

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
    syncedProductCount: v.number(),
    syncedSkuCount: v.number(),
  },
  handler: async (
    ctx,
    { setKey, completedAt, syncedProductCount, syncedSkuCount },
  ) => {
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
      syncedProductCount,
      syncedSkuCount,
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

export const markPricingSyncStarted = internalMutation({
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
      pricingSyncStatus: 'syncing',
      currentPricingSyncStartedAt: syncStartedAt,
      lastPricingSyncError: undefined,
      updatedAt: syncStartedAt,
    })
  },
})

export const markPricingSyncCompleted = internalMutation({
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
      pricingSyncStatus: 'idle',
      currentPricingSyncStartedAt: undefined,
      lastPricingSyncedAt: completedAt,
      lastPricingSyncError: undefined,
      updatedAt: completedAt,
    })
  },
})

export const markPricingSyncFailed = internalMutation({
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

    await ctx.db.patch('catalogSets', existing._id, {
      pricingSyncStatus: 'error',
      currentPricingSyncStartedAt: undefined,
      lastPricingSyncError: message,
      updatedAt: failedAt,
    })
  },
})

export const requestSetSync = internalMutation({
  args: {
    setKey: v.string(),
    mode: setSyncModeValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { setKey, mode }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const now = Date.now()

    if (isSetProcessing(existing)) {
      const nextPendingMode = pickHigherPrioritySyncMode(
        existing.pendingSyncMode,
        mode,
      )

      if (nextPendingMode !== existing.pendingSyncMode) {
        await ctx.db.patch('catalogSets', existing._id, {
          pendingSyncMode: nextPendingMode,
          updatedAt: now,
        })
      }

      return {
        scheduled: false,
        mode: nextPendingMode,
      }
    }

    if (mode === 'full') {
      await ctx.db.patch('catalogSets', existing._id, {
        syncStatus: 'syncing',
        currentSyncStartedAt: now,
        nextSyncAttemptAt: undefined,
        lastSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch('catalogSets', existing._id, {
        pricingSyncStatus: 'syncing',
        currentPricingSyncStartedAt: now,
        lastPricingSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    }

    return {
      scheduled: true,
      mode,
    }
  },
})

export const consumePendingSyncMode = internalMutation({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing || !existing.pendingSyncMode || isSetProcessing(existing)) {
      return {
        mode: null,
      }
    }

    const now = Date.now()
    const mode = existing.pendingSyncMode

    if (mode === 'full') {
      await ctx.db.patch('catalogSets', existing._id, {
        syncStatus: 'syncing',
        currentSyncStartedAt: now,
        nextSyncAttemptAt: undefined,
        lastSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch('catalogSets', existing._id, {
        pricingSyncStatus: 'syncing',
        currentPricingSyncStartedAt: now,
        lastPricingSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    }

    return { mode }
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
    const touchedProductKeys = new Set<string>()

    for (const incoming of products) {
      touchedProductKeys.add(incoming.key)
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

    await refreshRuleDashboardFieldsForProductKeys(
      ctx,
      [...touchedProductKeys],
    )

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

export const recordSetScopeCleanup = internalMutation({
  args: {
    setKey: v.string(),
    cleanedAt: v.number(),
  },
  handler: async (ctx, { setKey, cleanedAt }) => {
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
      lastSyncedAt: undefined,
      lastSyncError: undefined,
      nextSyncAttemptAt: undefined,
      consecutiveSyncFailures: undefined,
      syncedProductCount: 0,
      syncedSkuCount: 0,
      updatedAt: cleanedAt,
    })
  },
})

export const purgeSetSnapshot = internalMutation({
  args: {
    setKey: v.string(),
    productLimit: v.number(),
    skuLimit: v.number(),
  },
  handler: async (ctx, { setKey, productLimit, skuLimit }) => {
    const products = await ctx.db
      .query('catalogProducts')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .take(productLimit)
    const skus = await ctx.db
      .query('catalogSkus')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
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

export const claimSyncCandidates = internalMutation({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, { limit }) => {
    const maxResults = Math.max(1, Math.min(limit, 100))
    const allowedCategoryIds = getAllowedCatalogCategoryIds()
    const now = Date.now()
    const sets = await ctx.db.query('catalogSets').collect()
    const ruleScopedSetKeys = await listRuleScopedSetKeys(ctx, { sets })
    const cleanupCandidates = sets
      .filter(
        (set) =>
          !ruleScopedSetKeys.has(set.key) &&
          set.syncStatus !== 'syncing' &&
          set.pricingSyncStatus !== 'syncing' &&
          needsRuleScopeCleanup(set),
      )
      .sort(
        (left, right) => (right.lastSyncedAt ?? 0) - (left.lastSyncedAt ?? 0),
      )
    const inScopeCandidates = sets
      .filter((set) => ruleScopedSetKeys.has(set.key))
      .filter((set) => isSyncCandidateEligible(set, now, allowedCategoryIds))
      .sort(compareSyncCandidates)
    const candidates = [...cleanupCandidates, ...inScopeCandidates]
      .filter(
        (set, index, all) =>
          all.findIndex((entry) => entry.key === set.key) === index,
      )
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
