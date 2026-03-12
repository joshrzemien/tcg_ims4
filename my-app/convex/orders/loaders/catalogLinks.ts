import type { Doc } from '../../_generated/dataModel'
import type { DbCtx } from '../../lib/ctx'

type CatalogLinkItem = {
  productId?: string
  tcgplayerSku?: number
  catalogProductKey?: string
  catalogSkuKey?: string
}

type CatalogLinkOrder = {
  items?: Array<CatalogLinkItem>
}

type CatalogSkuDoc = Doc<'catalogSkus'>
type CatalogProductDoc = Doc<'catalogProducts'>

export type CatalogLookupMaps = {
  skuMap: Map<number, CatalogSkuDoc>
  productMap: Map<number, CatalogProductDoc>
}

export function normalizeProductId(
  productId: string | undefined,
): number | undefined {
  if (typeof productId !== 'string' || productId.trim() === '') {
    return undefined
  }

  const numericValue = Number(productId)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

export function distinctCatalogLookupKeys(items: Array<CatalogLinkItem>) {
  return {
    tcgplayerSkus: [
      ...new Set(
        items
          .map((item) =>
            typeof item.tcgplayerSku === 'number' ? item.tcgplayerSku : undefined,
          )
          .filter((value): value is number => typeof value === 'number'),
      ),
    ],
    tcgplayerProductIds: [
      ...new Set(
        items
          .map((item) => normalizeProductId(item.productId))
          .filter((value): value is number => typeof value === 'number'),
      ),
    ],
  }
}

export function collectBatchCatalogLookupKeys(orders: Array<CatalogLinkOrder>) {
  const tcgplayerSkus = new Set<number>()
  const tcgplayerProductIds = new Set<number>()

  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (typeof item.tcgplayerSku === 'number') {
        tcgplayerSkus.add(item.tcgplayerSku)
      }

      const productId = normalizeProductId(item.productId)
      if (typeof productId === 'number') {
        tcgplayerProductIds.add(productId)
      }
    }
  }

  return {
    tcgplayerSkus: [...tcgplayerSkus],
    tcgplayerProductIds: [...tcgplayerProductIds],
  }
}

export async function loadCatalogLookupMaps(
  ctx: DbCtx,
  params: {
    tcgplayerSkus: Array<number>
    tcgplayerProductIds: Array<number>
  },
): Promise<CatalogLookupMaps> {
  const skuMap = new Map<number, CatalogSkuDoc>()
  const productMap = new Map<number, CatalogProductDoc>()

  for (const tcgplayerSku of params.tcgplayerSkus) {
    const catalogSku = await ctx.db
      .query('catalogSkus')
      .withIndex('by_tcgplayerSku', (q: any) => q.eq('tcgplayerSku', tcgplayerSku))
      .unique()

    if (catalogSku) {
      skuMap.set(tcgplayerSku, catalogSku)
    }
  }

  for (const tcgplayerProductId of params.tcgplayerProductIds) {
    const catalogProduct = await ctx.db
      .query('catalogProducts')
      .withIndex('by_tcgplayerProductId', (q: any) =>
        q.eq('tcgplayerProductId', tcgplayerProductId),
      )
      .unique()

    if (catalogProduct) {
      productMap.set(tcgplayerProductId, catalogProduct)
    }
  }

  return {
    skuMap,
    productMap,
  }
}

export function enrichOrderItemsWithCatalogLinks<T extends CatalogLinkItem>(
  items: Array<T>,
  lookupMaps: CatalogLookupMaps,
): Array<T> {
  const { skuMap, productMap } = lookupMaps

  return items.map((item) => {
    const productId = normalizeProductId(item.productId)
    const catalogSku =
      typeof item.tcgplayerSku === 'number'
        ? skuMap.get(item.tcgplayerSku)
        : undefined
    const catalogProduct =
      typeof productId === 'number' ? productMap.get(productId) : undefined

    return {
      ...item,
      ...(catalogSku?.catalogProductKey
        ? { catalogProductKey: catalogSku.catalogProductKey }
        : catalogProduct?.key
          ? { catalogProductKey: catalogProduct.key }
          : {}),
      ...(catalogSku?.key ? { catalogSkuKey: catalogSku.key } : {}),
    }
  })
}

export function orderItemsNeedCatalogUpdate(
  currentItems: Array<CatalogLinkItem>,
  nextItems: Array<CatalogLinkItem>,
) {
  if (currentItems.length !== nextItems.length) {
    return true
  }

  return currentItems.some((item, index) => {
    const nextItem = nextItems[index]
    return (
      item.catalogProductKey !== nextItem.catalogProductKey ||
      item.catalogSkuKey !== nextItem.catalogSkuKey
    )
  })
}
