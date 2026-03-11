import type { Doc } from '../../_generated/dataModel'
import type { DbCtx } from '../../lib/ctx'

type InventoryContentDoc = Doc<'inventoryLocationContents'>
type InventoryLocationDoc = Doc<'inventoryLocations'>

export async function loadInventoryContentsBySkuKeys(
  ctx: DbCtx,
  catalogSkuKeys: Array<string>,
) {
  const entries = await Promise.all(
    [...new Set(catalogSkuKeys)].map(async (catalogSkuKey) => {
      const contents = await ctx.db
        .query('inventoryLocationContents')
        .withIndex('by_catalogSkuKey', (q: any) => q.eq('catalogSkuKey', catalogSkuKey))
        .collect()

      return [catalogSkuKey, contents] as const
    }),
  )

  return new Map<string, Array<InventoryContentDoc>>(entries)
}

export async function loadInventoryLocationsById(
  ctx: DbCtx,
  locationIds: Iterable<InventoryContentDoc['locationId']>,
) {
  const entries = await Promise.all(
    [...new Set(locationIds)].map(async (locationId) => {
      const location = await ctx.db.get('inventoryLocations', locationId)
      return [locationId, location] as const
    }),
  )

  return new Map<InventoryContentDoc['locationId'], InventoryLocationDoc | null>(entries)
}
