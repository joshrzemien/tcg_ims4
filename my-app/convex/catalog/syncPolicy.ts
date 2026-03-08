import type {
  TcgTrackingSetPayload,
  TcgTrackingSkuRecord,
} from './sources/tcgtracking'

type EligibleSkuShape = {
  conditionCode?: string
  languageCode?: string
}

function normalizeCode(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : undefined
}

export function isEligibleSku(sku: EligibleSkuShape): boolean {
  return (
    normalizeCode(sku.conditionCode) === 'NM' &&
    normalizeCode(sku.languageCode) === 'EN'
  )
}

export function filterEligibleSkus<T extends EligibleSkuShape>(
  skus: Array<T>,
): Array<T> {
  return skus.filter((sku) => isEligibleSku(sku))
}

function isEligibleSourceSku(sku: TcgTrackingSkuRecord): boolean {
  return isEligibleSku({
    conditionCode: sku.cnd,
    languageCode: sku.lng,
  })
}

export function filterSetPayloadToSyncScope(
  payload: TcgTrackingSetPayload,
): TcgTrackingSetPayload {
  const eligibleProductIds = new Set<string>()
  const filteredSkuProducts: Record<
    string,
    Record<string, TcgTrackingSkuRecord>
  > = {}
  let eligibleSkuCount = 0

  for (const [productId, productSkus] of Object.entries(
    payload.skus.products,
  )) {
    const filteredSkus = Object.fromEntries(
      Object.entries(productSkus).filter(([, sku]) => isEligibleSourceSku(sku)),
    )

    if (Object.keys(filteredSkus).length === 0) {
      continue
    }

    eligibleProductIds.add(productId)
    filteredSkuProducts[productId] = filteredSkus
    eligibleSkuCount += Object.keys(filteredSkus).length
  }

  const filteredProducts = payload.detail.products.filter((product) =>
    eligibleProductIds.has(String(product.id)),
  )
  const filteredPrices = Object.fromEntries(
    Object.entries(payload.pricing.prices).filter(([productId]) =>
      eligibleProductIds.has(productId),
    ),
  )

  return {
    detail: {
      ...payload.detail,
      product_count: filteredProducts.length,
      products: filteredProducts,
    },
    pricing: {
      ...payload.pricing,
      prices: filteredPrices,
    },
    skus: {
      ...payload.skus,
      product_count: filteredProducts.length,
      sku_count: eligibleSkuCount,
      products: filteredSkuProducts,
    },
  }
}
