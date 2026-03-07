import { v } from 'convex/values'
import { query } from '../_generated/server'
import { getAllowedCatalogCategoryIds } from './config'
import {
  compareSyncCandidates,
  getSyncPriority,
  isSyncCandidateEligible,
} from './syncState'

async function countDocuments(
  queryHandle: AsyncIterable<unknown>,
): Promise<number> {
  let count = 0

  for await (const _document of queryHandle) {
    count += 1
  }

  return count
}

export const getSetByKey = query({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }) => {
    return await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()
  },
})

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query('catalogCategories').collect()

    return categories
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((category) => ({
        key: category.key,
        label: category.displayName,
        name: category.name,
        displayName: category.displayName,
        tcgtrackingCategoryId: category.tcgtrackingCategoryId,
        productCount: category.productCount,
        setCount: category.setCount,
        updatedAt: category.updatedAt,
      }))
  },
})

export const listSets = query({
  args: {
    categoryKey: v.optional(v.string()),
  },
  handler: async (ctx, { categoryKey }) => {
    const sets = categoryKey
      ? await ctx.db
          .query('catalogSets')
          .withIndex('by_categoryKey', (q) => q.eq('categoryKey', categoryKey))
          .collect()
      : await ctx.db.query('catalogSets').collect()

    return sets
      .sort((left, right) => {
        const categoryComparison = left.categoryDisplayName.localeCompare(
          right.categoryDisplayName,
        )
        if (categoryComparison !== 0) {
          return categoryComparison
        }

        return left.name.localeCompare(right.name)
      })
      .map((set) => ({
        key: set.key,
        label: `${set.categoryDisplayName} / ${set.name}`,
        name: set.name,
        abbreviation: set.abbreviation,
        categoryKey: set.categoryKey,
        categoryDisplayName: set.categoryDisplayName,
        tcgtrackingSetId: set.tcgtrackingSetId,
        productCount: set.productCount,
        skuCount: set.skuCount,
        publishedOn: set.publishedOn,
        syncStatus: set.syncStatus,
        updatedAt: set.updatedAt,
      }))
  },
})

export const listSyncCandidates = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const sets = await ctx.db.query('catalogSets').collect()
    const maxResults = Math.max(1, Math.min(limit ?? 25, 100))
    const allowedCategoryIds = getAllowedCatalogCategoryIds()
    const now = Date.now()

    return sets
      .filter((set) => isSyncCandidateEligible(set, now, allowedCategoryIds))
      .sort(compareSyncCandidates)
      .slice(0, maxResults)
      .map((set) => ({
        ...set,
        syncPriority: getSyncPriority(set),
      }))
  },
})

export const getByTcgplayerSku = query({
  args: {
    tcgplayerSku: v.number(),
  },
  handler: async (ctx, { tcgplayerSku }) => {
    const sku = await ctx.db
      .query('catalogSkus')
      .withIndex('by_tcgplayerSku', (q) => q.eq('tcgplayerSku', tcgplayerSku))
      .unique()

    if (!sku) {
      return null
    }

    const product = await ctx.db
      .query('catalogProducts')
      .withIndex('by_key', (q) => q.eq('key', sku.catalogProductKey))
      .unique()

    return {
      sku,
      product,
    }
  },
})

export const hasCatalogSets = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('catalogSets').first()) !== null
  },
})

export const getSyncSummary = query({
  args: {},
  handler: async (ctx) => {
    const [categories, sets, products, skus, orders] = await Promise.all([
      countDocuments(ctx.db.query('catalogCategories')),
      ctx.db.query('catalogSets').collect(),
      countDocuments(ctx.db.query('catalogProducts')),
      countDocuments(ctx.db.query('catalogSkus')),
      ctx.db.query('orders').collect(),
    ])

    let linkedOrderItems = 0
    let unlinkedOrderItems = 0

    for (const order of orders) {
      for (const item of order.items) {
        if (typeof item.tcgplayerSku !== 'number') {
          continue
        }

        if (item.catalogSkuKey || item.catalogProductKey) {
          linkedOrderItems += 1
        } else {
          unlinkedOrderItems += 1
        }
      }
    }

    return {
      categories,
      sets: {
        total: sets.length,
        pending: sets.filter((set) => set.syncStatus === 'pending').length,
        syncing: sets.filter((set) => set.syncStatus === 'syncing').length,
        ready: sets.filter((set) => set.syncStatus === 'ready').length,
        error: sets.filter((set) => set.syncStatus === 'error').length,
      },
      products,
      skus,
      orderItems: {
        linked: linkedOrderItems,
        unlinked: unlinkedOrderItems,
      },
    }
  },
})
