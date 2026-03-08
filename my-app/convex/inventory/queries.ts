import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { query } from '../_generated/server'
import { buildInventoryListRow } from './model'
import type { Doc } from '../_generated/dataModel'

const inventoryTypeValidator = v.union(
  v.literal('single'),
  v.literal('sealed'),
)

type InventoryItemDoc = Doc<'inventoryItems'>
type CatalogProductDoc = Doc<'catalogProducts'>
type CatalogSkuDoc = Doc<'catalogSkus'>
type CatalogSetDoc = Doc<'catalogSets'>
type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

async function loadProductsByKey(
  ctx: { db: any },
  productKeys: Iterable<string>,
) {
  const productEntries = await Promise.all(
    [...new Set(productKeys)].map(async (productKey) => {
      const product = await ctx.db
        .query('catalogProducts')
        .withIndex('by_key', (q: any) => q.eq('key', productKey))
        .unique()

      return [productKey, product] as const
    }),
  )

  return new Map<string, CatalogProductDoc | null>(productEntries)
}

async function loadSkusByKey(ctx: { db: any }, skuKeys: Iterable<string>) {
  const skuEntries = await Promise.all(
    [...new Set(skuKeys)].map(async (skuKey) => {
      const sku = await ctx.db
        .query('catalogSkus')
        .withIndex('by_key', (q: any) => q.eq('key', skuKey))
        .unique()

      return [skuKey, sku] as const
    }),
  )

  return new Map<string, CatalogSkuDoc | null>(skuEntries)
}

async function loadSetsByKey(ctx: { db: any }, setKeys: Iterable<string>) {
  const setEntries = await Promise.all(
    [...new Set(setKeys)].map(async (setKey) => {
      const set = await ctx.db
        .query('catalogSets')
        .withIndex('by_key', (q: any) => q.eq('key', setKey))
        .unique()

      return [setKey, set] as const
    }),
  )

  return new Map<string, CatalogSetDoc | null>(setEntries)
}

async function loadTrackedSeriesByProductKey(
  ctx: { db: any },
  productKeys: Iterable<string>,
) {
  const seriesEntries = await Promise.all(
    [...new Set(productKeys)].map(async (productKey) => {
      const trackedSeries = await ctx.db
        .query('pricingTrackedSeries')
        .withIndex('by_catalogProductKey', (q: any) =>
          q.eq('catalogProductKey', productKey),
        )
        .collect()

      return [productKey, trackedSeries] as const
    }),
  )

  return new Map<string, Array<PricingTrackedSeriesDoc>>(seriesEntries)
}

async function hydrateInventoryRows(
  ctx: { db: any },
  items: Array<InventoryItemDoc>,
) {
  const productsByKey = await loadProductsByKey(
    ctx,
    items.map((item) => item.catalogProductKey),
  )
  const skusByKey = await loadSkusByKey(
    ctx,
    items
      .map((item) => item.catalogSkuKey)
      .filter((value): value is string => typeof value === 'string'),
  )
  const trackedSeriesByProductKey = await loadTrackedSeriesByProductKey(
    ctx,
    items.map((item) => item.catalogProductKey),
  )
  const setsByKey = await loadSetsByKey(
    ctx,
    items
      .map((item) => productsByKey.get(item.catalogProductKey)?.setKey)
      .filter((value): value is string => typeof value === 'string'),
  )

  return items.flatMap((item) => {
    const product = productsByKey.get(item.catalogProductKey)
    if (!product) {
      return []
    }

    const sku =
      typeof item.catalogSkuKey === 'string'
        ? skusByKey.get(item.catalogSkuKey) ?? null
        : null

    return [
      buildInventoryListRow({
        item,
        product,
        sku,
        set: setsByKey.get(product.setKey) ?? null,
        trackedSeries: trackedSeriesByProductKey.get(product.key) ?? [],
      }),
    ]
  })
}

export const listPage = query({
  args: {
    inventoryType: inventoryTypeValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { inventoryType, paginationOpts }) => {
    const page = await ctx.db
      .query('inventoryItems')
      .withIndex('by_inventoryType_updatedAt', (q) =>
        q.eq('inventoryType', inventoryType),
      )
      .order('desc')
      .paginate(paginationOpts)

    return {
      ...page,
      page: await hydrateInventoryRows(ctx, page.page),
    }
  },
})

export const getById = query({
  args: {
    inventoryItemId: v.id('inventoryItems'),
  },
  handler: async (ctx, { inventoryItemId }) => {
    const item = await ctx.db.get('inventoryItems', inventoryItemId)

    if (!item) {
      return null
    }

    const rows = await hydrateInventoryRows(ctx, [item])
    return rows.length > 0 ? rows[0] : null
  },
})

export const getSummary = query({
  args: {
    inventoryType: v.optional(inventoryTypeValidator),
  },
  handler: async (ctx, { inventoryType }) => {
    const items =
      typeof inventoryType === 'string'
        ? await ctx.db
            .query('inventoryItems')
            .withIndex('by_inventoryType_updatedAt', (q) =>
              q.eq('inventoryType', inventoryType),
            )
            .collect()
        : await ctx.db.query('inventoryItems').collect()

    const rows = await hydrateInventoryRows(ctx, items)

    const emptyTypeSummary = () => ({
      itemCount: 0,
      totalQuantity: 0,
      totalMarketValueCents: 0,
      totalLowValueCents: 0,
      totalHighValueCents: 0,
      pricedItemCount: 0,
    })

    const byType = {
      single: emptyTypeSummary(),
      sealed: emptyTypeSummary(),
    }

    for (const row of rows) {
      const typeSummary = byType[row.inventoryType]
      typeSummary.itemCount += 1
      typeSummary.totalQuantity += row.quantity
      typeSummary.totalMarketValueCents += row.price.totalMarketPriceCents ?? 0
      typeSummary.totalLowValueCents += row.price.totalLowPriceCents ?? 0
      typeSummary.totalHighValueCents += row.price.totalHighPriceCents ?? 0
      if (typeof row.price.resolvedMarketPriceCents === 'number') {
        typeSummary.pricedItemCount += 1
      }
    }

    return {
      itemCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      totalMarketValueCents: rows.reduce(
        (sum, row) => sum + (row.price.totalMarketPriceCents ?? 0),
        0,
      ),
      totalLowValueCents: rows.reduce(
        (sum, row) => sum + (row.price.totalLowPriceCents ?? 0),
        0,
      ),
      totalHighValueCents: rows.reduce(
        (sum, row) => sum + (row.price.totalHighPriceCents ?? 0),
        0,
      ),
      pricedItemCount: rows.filter(
        (row) => typeof row.price.resolvedMarketPriceCents === 'number',
      ).length,
      byType,
    }
  },
})
