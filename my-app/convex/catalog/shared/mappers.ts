import { dollarsToCents } from '../../lib/currency'
import type { Doc } from '../../_generated/dataModel'
import type { fetchCatalogSetPayload } from '../sources/tcgtracking'

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeOptionalStringArray(
  value: unknown,
): Array<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim() !== '',
  )

  return items.length > 0 ? items : undefined
}

function normalizeOptionalRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return Object.keys(value as Record<string, unknown>).length > 0
    ? (value as Record<string, unknown>)
    : undefined
}

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export function buildCategoryKey(categoryId: number) {
  return `tcgtracking:category:${categoryId}`
}

export function buildSetKey(categoryId: number, setId: number) {
  return `tcgtracking:set:${categoryId}:${setId}`
}

export function buildProductKey(
  categoryId: number,
  setId: number,
  productId: number,
) {
  return `tcgtracking:product:${categoryId}:${setId}:${productId}`
}

export function buildSkuKey(
  categoryId: number,
  setId: number,
  productId: number,
  skuId: number,
) {
  return `tcgtracking:sku:${categoryId}:${setId}:${productId}:${skuId}`
}

export function mapCategory(category: {
  id: number
  name: string
  display_name: string
  product_count: number
  set_count: number
}) {
  return {
    key: buildCategoryKey(category.id),
    tcgtrackingCategoryId: category.id,
    name: category.name,
    displayName: category.display_name,
    productCount: category.product_count,
    setCount: category.set_count,
    updatedAt: Date.now(),
  }
}

export function mapSet(
  category: { id: number; display_name: string },
  set: {
    id: number
    name: string
    abbreviation?: string | null
    published_on?: string | null
    modified_on?: string | null
    product_count: number
    sku_count: number
    products_modified?: string | null
    pricing_modified?: string | null
    skus_modified?: string | null
  },
) {
  return {
    key: buildSetKey(category.id, set.id),
    categoryKey: buildCategoryKey(category.id),
    tcgtrackingCategoryId: category.id,
    categoryDisplayName: category.display_name,
    tcgtrackingSetId: set.id,
    name: set.name,
    abbreviation: normalizeOptionalString(set.abbreviation),
    publishedOn: normalizeOptionalString(set.published_on),
    modifiedOn: normalizeOptionalString(set.modified_on),
    productCount: set.product_count,
    skuCount: set.sku_count,
    productsModifiedAt: normalizeOptionalString(set.products_modified),
    pricingModifiedAt: normalizeOptionalString(set.pricing_modified),
    skusModifiedAt: normalizeOptionalString(set.skus_modified),
    updatedAt: Date.now(),
  }
}

export function mapProducts(
  set: Doc<'catalogSets'>,
  payload: Awaited<ReturnType<typeof fetchCatalogSetPayload>>,
) {
  const pricingUpdatedAt = toTimestamp(
    normalizeOptionalString(payload.pricing.updated),
  )
  const skuPricingUpdatedAt = toTimestamp(
    normalizeOptionalString(payload.skus.updated),
  )
  return payload.detail.products.map((product) => {
    const productPricing = payload.pricing.prices[String(product.id)] ?? {}

    return {
      key: buildProductKey(
        set.tcgtrackingCategoryId,
        set.tcgtrackingSetId,
        product.id,
      ),
      categoryKey: set.categoryKey,
      setKey: set.key,
      tcgtrackingCategoryId: set.tcgtrackingCategoryId,
      tcgtrackingSetId: set.tcgtrackingSetId,
      tcgplayerProductId: product.id,
      tcgplayerUrl: normalizeOptionalString(product.tcgplayer_url),
      name: product.name,
      cleanName: product.clean_name,
      number: normalizeOptionalString(product.number),
      rarity: normalizeOptionalString(product.rarity),
      finishes: normalizeOptionalStringArray(product.finishes),
      tcgplayerPricing: normalizeOptionalRecord(productPricing.tcg),
      manapoolPricing: normalizeOptionalRecord(productPricing.manapool),
      manapoolQuantity: normalizeOptionalNumber(productPricing.mp_qty),
      pricingUpdatedAt,
      skuPricingUpdatedAt,
    }
  })
}

export function mapSkus(
  set: Doc<'catalogSets'>,
  payload: Awaited<ReturnType<typeof fetchCatalogSetPayload>>,
) {
  const pricingUpdatedAt = toTimestamp(
    normalizeOptionalString(payload.skus.updated),
  )
  const skus: Array<Record<string, unknown>> = []

  for (const [productId, productSkus] of Object.entries(
    payload.skus.products,
  )) {
    const tcgplayerProductId = Number(productId)
    if (!Number.isFinite(tcgplayerProductId)) {
      continue
    }

    for (const [skuId, sku] of Object.entries(productSkus)) {
      const tcgplayerSku = Number(skuId)
      if (!Number.isFinite(tcgplayerSku)) {
        continue
      }

      skus.push({
        key: buildSkuKey(
          set.tcgtrackingCategoryId,
          set.tcgtrackingSetId,
          tcgplayerProductId,
          tcgplayerSku,
        ),
        catalogProductKey: buildProductKey(
          set.tcgtrackingCategoryId,
          set.tcgtrackingSetId,
          tcgplayerProductId,
        ),
        categoryKey: set.categoryKey,
        setKey: set.key,
        tcgplayerSku,
        conditionCode: normalizeOptionalString(sku.cnd),
        variantCode: normalizeOptionalString(sku.var),
        languageCode: normalizeOptionalString(sku.lng),
        marketPriceCents:
          typeof sku.mkt === 'number' ? dollarsToCents(sku.mkt) : undefined,
        lowPriceCents:
          typeof sku.low === 'number' ? dollarsToCents(sku.low) : undefined,
        highPriceCents:
          typeof sku.hi === 'number' ? dollarsToCents(sku.hi) : undefined,
        listingCount: normalizeOptionalNumber(sku.cnt),
        pricingUpdatedAt,
      })
    }
  }

  return skus
}
