import { v } from 'convex/values'
import { query } from '../_generated/server'
import { loadSyncCandidates } from './syncCandidates'
import { getAllowedCatalogCategoryIds } from './config'
import { getSyncPriority } from './syncState'

async function countDocuments(
  queryHandle: AsyncIterable<unknown>,
): Promise<number> {
  let count = 0

  for await (const _document of queryHandle) {
    count += 1
  }

  return count
}

function normalizePrintingKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function incrementCount(map: Map<string, number>, key: string | undefined) {
  if (!key) {
    return
  }

  map.set(key, (map.get(key) ?? 0) + 1)
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
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { search, limit }) => {
    const normalizedSearch = search?.trim()
    const maxResults = Math.max(1, Math.min(limit ?? 25, 100))
    const categories =
      normalizedSearch && normalizedSearch.length >= 2
        ? await ctx.db
            .query('catalogCategories')
            .withSearchIndex('search_displayName', (q) =>
              q.search('displayName', normalizedSearch),
            )
            .take(maxResults)
        : await ctx.db
            .query('catalogCategories')
            .withIndex('by_displayName')
            .take(maxResults)

    return categories.map((category) => ({
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
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { categoryKey, search, limit }) => {
    const normalizedSearch = search?.trim()
    const maxResults = Math.max(1, Math.min(limit ?? 25, 100))
    const sets =
      normalizedSearch && normalizedSearch.length >= 2
        ? await ctx.db
            .query('catalogSets')
            .withSearchIndex('search_name', (q) => {
              let searchQuery = q.search('name', normalizedSearch)
              if (categoryKey) {
                searchQuery = searchQuery.eq('categoryKey', categoryKey)
              }
              return searchQuery
            })
            .take(maxResults)
        : categoryKey
          ? await ctx.db
              .query('catalogSets')
              .withIndex('by_categoryKey_name', (q) =>
                q.eq('categoryKey', categoryKey),
              )
              .take(maxResults)
          : await ctx.db.query('catalogSets').withIndex('by_name').take(maxResults)

    return sets.map((set) => ({
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
      pricingSyncStatus: set.pricingSyncStatus,
      pendingSyncMode: set.pendingSyncMode,
      syncedProductCount: set.syncedProductCount,
      syncedSkuCount: set.syncedSkuCount,
      updatedAt: set.updatedAt,
    }))
  },
})

export const listSyncCandidates = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const maxResults = Math.max(1, Math.min(limit ?? 25, 100))
    const allowedCategoryIds = getAllowedCatalogCategoryIds()
    const now = Date.now()
    const orderedCandidates = await loadSyncCandidates(ctx, {
      limit: maxResults,
      allowedCategoryIds,
      now,
    })

    return orderedCandidates
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

export const inspectSetFinishMapping = query({
  args: {
    setKey: v.string(),
    sampleSize: v.optional(v.number()),
  },
  handler: async (ctx, { setKey, sampleSize }) => {
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      return null
    }

    const products = await ctx.db
      .query('catalogProducts')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .collect()
    const skus = await ctx.db
      .query('catalogSkus')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .collect()

    const limitedSampleSize = Math.max(1, Math.min(sampleSize ?? 20, 100))
    const finishCounts = new Map<string, number>()
    const pricingLabelCounts = new Map<string, number>()
    const normalizedPricingKeyCounts = new Map<string, number>()
    const variantCodeCounts = new Map<string, number>()
    const skuVariantByProductKey = new Map<string, Set<string>>()

    for (const sku of skus) {
      incrementCount(variantCodeCounts, sku.variantCode ?? '(missing)')

      let productVariants = skuVariantByProductKey.get(sku.catalogProductKey)
      if (!productVariants) {
        productVariants = new Set<string>()
        skuVariantByProductKey.set(sku.catalogProductKey, productVariants)
      }

      productVariants.add(sku.variantCode ?? '(missing)')
    }

    const productSamples: Array<{
      productKey: string
      name: string
      number?: string
      rarity?: string
      finishes?: Array<string>
      pricingLabels: Array<string>
      normalizedPricingKeys: Array<string>
      skuVariantCodes: Array<string>
    }> = []

    for (const product of products) {
      for (const finish of product.finishes ?? []) {
        incrementCount(finishCounts, finish)
      }

      const pricingLabels =
        product.tcgplayerPricing &&
        typeof product.tcgplayerPricing === 'object' &&
        !Array.isArray(product.tcgplayerPricing)
          ? Object.keys(product.tcgplayerPricing as Record<string, unknown>)
          : []

      for (const pricingLabel of pricingLabels) {
        incrementCount(pricingLabelCounts, pricingLabel)
        incrementCount(
          normalizedPricingKeyCounts,
          normalizePrintingKey(pricingLabel),
        )
      }

      const skuVariantCodes = [
        ...(skuVariantByProductKey.get(product.key) ?? new Set()),
      ].sort()

      if (
        productSamples.length < limitedSampleSize &&
        ((product.finishes?.length ?? 0) > 0 ||
          pricingLabels.length > 1 ||
          skuVariantCodes.length > 1)
      ) {
        productSamples.push({
          productKey: product.key,
          name: product.name,
          number: product.number,
          rarity: product.rarity,
          finishes: product.finishes,
          pricingLabels: pricingLabels.sort(),
          normalizedPricingKeys: pricingLabels
            .map((label) => normalizePrintingKey(label))
            .sort(),
          skuVariantCodes,
        })
      }
    }

    const sortedEntries = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((left, right) =>
          right[1] === left[1]
            ? left[0].localeCompare(right[0])
            : right[1] - left[1],
        )
        .map(([value, count]) => ({ value, count }))

    return {
      set: {
        key: set.key,
        name: set.name,
        categoryDisplayName: set.categoryDisplayName,
        tcgtrackingSetId: set.tcgtrackingSetId,
        productCount: set.productCount,
        skuCount: set.skuCount,
      },
      totals: {
        products: products.length,
        skus: skus.length,
      },
      finishCounts: sortedEntries(finishCounts),
      pricingLabelCounts: sortedEntries(pricingLabelCounts),
      normalizedPricingKeyCounts: sortedEntries(normalizedPricingKeyCounts),
      variantCodeCounts: sortedEntries(variantCodeCounts),
      productSamples,
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
