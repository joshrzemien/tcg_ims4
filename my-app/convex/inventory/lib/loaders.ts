import type { Doc, Id } from '../../_generated/dataModel'

type DbCtx = { db: any }

export type InventoryContentDoc = Doc<'inventoryLocationContents'>
export type InventoryLocationDoc = Doc<'inventoryLocations'>
export type InventoryUnitDetailDoc = Doc<'inventoryUnitDetails'>
export type CatalogProductDoc = Doc<'catalogProducts'>
export type CatalogSetDoc = Doc<'catalogSets'>
export type CatalogSkuDoc = Doc<'catalogSkus'>
export type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

export async function loadProductsByKey(
  ctx: DbCtx,
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

export async function loadSkusByKey(ctx: DbCtx, skuKeys: Iterable<string>) {
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

export async function loadSetsByKey(ctx: DbCtx, setKeys: Iterable<string>) {
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

export async function loadTrackedSeriesByProductKey(
  ctx: DbCtx,
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

export async function loadLocationsById(
  ctx: DbCtx,
  locationIds: Iterable<Id<'inventoryLocations'>>,
) {
  const entries = await Promise.all(
    [...new Set(locationIds)].map(async (locationId) => {
      const location = await ctx.db.get('inventoryLocations', locationId)
      return [locationId, location] as const
    }),
  )

  return new Map<Id<'inventoryLocations'>, InventoryLocationDoc | null>(entries)
}

export async function loadUnitDetailsByContentId(
  ctx: DbCtx,
  contentIds: Iterable<Id<'inventoryLocationContents'>>,
) {
  const entries = await Promise.all(
    [...new Set(contentIds)].map(async (contentId) => {
      const detail = await ctx.db
        .query('inventoryUnitDetails')
        .withIndex('by_contentId', (q: any) => q.eq('contentId', contentId))
        .unique()

      return [contentId, detail] as const
    }),
  )

  return new Map<Id<'inventoryLocationContents'>, InventoryUnitDetailDoc | null>(
    entries,
  )
}
