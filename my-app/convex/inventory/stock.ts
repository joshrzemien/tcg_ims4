import { v } from 'convex/values'
import { query } from '../_generated/server'
import { buildInventoryAggregateRows } from './lib/readModels'
import { inventoryClassValidator } from './shared'
import type { Doc } from '../_generated/dataModel'

type ContentDoc = Doc<'inventoryLocationContents'>

async function buildAggregateRows(ctx: { db: any }, contents: Array<ContentDoc>) {
  return await buildInventoryAggregateRows(ctx, contents)
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
