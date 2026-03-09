import { query } from '../_generated/server'
import { v } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import {
  appendWorkflowBreakdown,
  buildContentAggregateKey,
  buildEmptyWorkflowBreakdown,
  buildInventoryAggregateRow,
} from './model'
import { inventoryClassValidator } from './shared'

type ContentDoc = Doc<'inventoryLocationContents'>
type CatalogProductDoc = Doc<'catalogProducts'>
type CatalogSetDoc = Doc<'catalogSets'>
type CatalogSkuDoc = Doc<'catalogSkus'>
type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

async function loadProductsByKey(
  ctx: { db: any },
  productKeys: Iterable<string>,
) {
  const entries = await Promise.all(
    [...new Set(productKeys)].map(async (productKey) => {
      const product = await ctx.db
        .query('catalogProducts')
        .withIndex('by_key', (q: any) => q.eq('key', productKey))
        .unique()

      return [productKey, product] as const
    }),
  )

  return new Map<string, CatalogProductDoc | null>(entries)
}

async function loadSkusByKey(ctx: { db: any }, skuKeys: Iterable<string>) {
  const entries = await Promise.all(
    [...new Set(skuKeys)].map(async (skuKey) => {
      const sku = await ctx.db
        .query('catalogSkus')
        .withIndex('by_key', (q: any) => q.eq('key', skuKey))
        .unique()

      return [skuKey, sku] as const
    }),
  )

  return new Map<string, CatalogSkuDoc | null>(entries)
}

async function loadSetsByKey(ctx: { db: any }, setKeys: Iterable<string>) {
  const entries = await Promise.all(
    [...new Set(setKeys)].map(async (setKey) => {
      const set = await ctx.db
        .query('catalogSets')
        .withIndex('by_key', (q: any) => q.eq('key', setKey))
        .unique()

      return [setKey, set] as const
    }),
  )

  return new Map<string, CatalogSetDoc | null>(entries)
}

async function loadTrackedSeriesByProductKey(
  ctx: { db: any },
  productKeys: Iterable<string>,
) {
  const entries = await Promise.all(
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

  return new Map<string, Array<PricingTrackedSeriesDoc>>(entries)
}

async function loadLocationsById(
  ctx: { db: any },
  locationIds: Iterable<ContentDoc['locationId']>,
) {
  const entries = await Promise.all(
    [...new Set(locationIds)].map(async (locationId) => {
      const location = await ctx.db.get(locationId)
      return [locationId, location] as const
    }),
  )

  return new Map<ContentDoc['locationId'], Doc<'inventoryLocations'> | null>(entries)
}

async function buildAggregateRows(ctx: { db: any }, contents: Array<ContentDoc>) {
  const aggregates = new Map<
    string,
    {
      aggregateKey: string
      inventoryClass: ContentDoc['inventoryClass']
      catalogProductKey: string
      catalogSkuKey?: string
      totalQuantity: number
      distinctLocationIds: Set<ContentDoc['locationId']>
      workflowBreakdown: ReturnType<typeof buildEmptyWorkflowBreakdown>
      latestUpdatedAt: number
      locationCodes: Set<string>
    }
  >()

  const locationsById = await loadLocationsById(
    ctx,
    contents.map((content) => content.locationId),
  )

  for (const content of contents) {
    const aggregateKey = buildContentAggregateKey({
      inventoryClass: content.inventoryClass,
      catalogProductKey: content.catalogProductKey,
      catalogSkuKey: content.catalogSkuKey,
    })
    const location = locationsById.get(content.locationId)
    const existing =
      aggregates.get(aggregateKey) ??
      {
        aggregateKey,
        inventoryClass: content.inventoryClass,
        catalogProductKey: content.catalogProductKey,
        ...(content.catalogSkuKey ? { catalogSkuKey: content.catalogSkuKey } : {}),
        totalQuantity: 0,
        distinctLocationIds: new Set<ContentDoc['locationId']>(),
        workflowBreakdown: buildEmptyWorkflowBreakdown(),
        latestUpdatedAt: 0,
        locationCodes: new Set<string>(),
      }

    existing.totalQuantity += content.quantity
    existing.distinctLocationIds.add(content.locationId)
    appendWorkflowBreakdown(
      existing.workflowBreakdown,
      content.workflowStatus,
      content.quantity,
    )
    existing.latestUpdatedAt = Math.max(existing.latestUpdatedAt, content.updatedAt)
    if (location) {
      existing.locationCodes.add(location.code)
    }
    aggregates.set(aggregateKey, existing)
  }

  const aggregateValues = [...aggregates.values()]
  const productsByKey = await loadProductsByKey(
    ctx,
    aggregateValues.map((aggregate) => aggregate.catalogProductKey),
  )
  const skusByKey = await loadSkusByKey(
    ctx,
    aggregateValues
      .map((aggregate) => aggregate.catalogSkuKey)
      .filter((value): value is string => typeof value === 'string'),
  )
  const trackedSeriesByProductKey = await loadTrackedSeriesByProductKey(
    ctx,
    aggregateValues.map((aggregate) => aggregate.catalogProductKey),
  )
  const setsByKey = await loadSetsByKey(
    ctx,
    aggregateValues
      .map((aggregate) => productsByKey.get(aggregate.catalogProductKey)?.setKey)
      .filter((value): value is string => typeof value === 'string'),
  )

  return aggregateValues
    .flatMap((aggregate) => {
      const product = productsByKey.get(aggregate.catalogProductKey)
      if (!product) {
        return []
      }

      const sku =
        typeof aggregate.catalogSkuKey === 'string'
          ? skusByKey.get(aggregate.catalogSkuKey) ?? null
          : null

      return [
        buildInventoryAggregateRow({
          aggregate,
          product,
          sku,
          set: setsByKey.get(product.setKey) ?? null,
          trackedSeries: trackedSeriesByProductKey.get(product.key) ?? [],
        }),
      ]
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

async function listContents(
  ctx: { db: any },
  args: {
    inventoryClass?: ContentDoc['inventoryClass']
    catalogProductKey?: string
    catalogSkuKey?: string
  },
) {
  let contents: Array<ContentDoc>

  if (args.inventoryClass && args.catalogSkuKey) {
    contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_inventoryClass_catalogSkuKey', (q: any) =>
        q.eq('inventoryClass', args.inventoryClass).eq('catalogSkuKey', args.catalogSkuKey),
      )
      .collect()
  } else if (args.inventoryClass && args.catalogProductKey) {
    contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_inventoryClass_catalogProductKey', (q: any) =>
        q
          .eq('inventoryClass', args.inventoryClass)
          .eq('catalogProductKey', args.catalogProductKey),
      )
      .collect()
  } else if (args.catalogSkuKey) {
    contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_catalogSkuKey', (q: any) => q.eq('catalogSkuKey', args.catalogSkuKey))
      .collect()
  } else if (args.catalogProductKey) {
    contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_catalogProductKey', (q: any) =>
        q.eq('catalogProductKey', args.catalogProductKey),
      )
      .collect()
  } else if (args.inventoryClass) {
    contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_inventoryClass', (q: any) =>
        q.eq('inventoryClass', args.inventoryClass),
      )
      .collect()
  } else {
    contents = await ctx.db.query('inventoryLocationContents').collect()
  }

  return contents
}

export const listAggregateByClass = query({
  args: {
    inventoryClass: inventoryClassValidator,
  },
  handler: async (ctx, args) => {
    return await buildAggregateRows(
      ctx,
      await listContents(ctx, { inventoryClass: args.inventoryClass }),
    )
  },
})

export const getAggregateSummary = query({
  args: {
    inventoryClass: v.optional(inventoryClassValidator),
  },
  handler: async (ctx, args) => {
    const rows = await buildAggregateRows(
      ctx,
      await listContents(ctx, {
        ...(args.inventoryClass ? { inventoryClass: args.inventoryClass } : {}),
      }),
    )

    const emptyTypeSummary = () => ({
      itemCount: 0,
      totalQuantity: 0,
      totalMarketValueCents: 0,
      totalLowValueCents: 0,
      totalHighValueCents: 0,
      pricedItemCount: 0,
      totalLocationCount: 0,
    })

    const byType = {
      single: emptyTypeSummary(),
      sealed: emptyTypeSummary(),
      graded: emptyTypeSummary(),
    }

    for (const row of rows) {
      const typeSummary = byType[row.inventoryClass]
      typeSummary.itemCount += 1
      typeSummary.totalQuantity += row.totalQuantity
      typeSummary.totalMarketValueCents += row.price.totalMarketPriceCents ?? 0
      typeSummary.totalLowValueCents += row.price.totalLowPriceCents ?? 0
      typeSummary.totalHighValueCents += row.price.totalHighPriceCents ?? 0
      typeSummary.totalLocationCount += row.distinctLocationCount
      if (typeof row.price.resolvedMarketPriceCents === 'number') {
        typeSummary.pricedItemCount += 1
      }
    }

    return {
      itemCount: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.totalQuantity, 0),
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
      totalLocationCount: rows.reduce(
        (sum, row) => sum + row.distinctLocationCount,
        0,
      ),
      byType,
    }
  },
})

export const getAggregateByProduct = query({
  args: {
    catalogProductKey: v.string(),
    inventoryClass: v.optional(inventoryClassValidator),
  },
  handler: async (ctx, args) => {
    return await buildAggregateRows(
      ctx,
      await listContents(ctx, {
        catalogProductKey: args.catalogProductKey,
        ...(args.inventoryClass ? { inventoryClass: args.inventoryClass } : {}),
      }),
    )
  },
})

export const getAggregateBySku = query({
  args: {
    catalogSkuKey: v.string(),
    inventoryClass: v.optional(inventoryClassValidator),
  },
  handler: async (ctx, args) => {
    const rows = await buildAggregateRows(
      ctx,
      await listContents(ctx, {
        catalogSkuKey: args.catalogSkuKey,
        ...(args.inventoryClass ? { inventoryClass: args.inventoryClass } : {}),
      }),
    )

    return rows[0] ?? null
  },
})
