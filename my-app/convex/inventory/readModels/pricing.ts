import { getTrackedPrintingDefinitions } from '../../lib/printing'
import { buildTcgplayerProductUrl } from '../shared/keys'
import type {
  CatalogProductDoc,
  CatalogSkuDoc,
  InventoryPriceOption,
  InventoryPriceSummary,
  InventoryResolvedPriceField,
  PricingTrackedSeriesDoc,
} from '../shared/types'

function buildTrackedSeriesPriceOptions(params: {
  trackedSeries: Array<PricingTrackedSeriesDoc>
  sku?: CatalogSkuDoc | null
}) {
  const { trackedSeries, sku } = params

  return trackedSeries
    .map((series) => ({
      key: series.key,
      label: series.printingLabel,
      printingKey: series.printingKey,
      printingLabel: series.printingLabel,
      skuVariantCode: series.skuVariantCode,
      matched:
        (typeof sku?.key === 'string' &&
          series.preferredCatalogSkuKey === sku.key) ||
        (typeof sku?.variantCode === 'string' &&
          series.skuVariantCode === sku.variantCode) ||
        (!sku && series.printingKey === 'normal'),
      source: 'tracked_series' as const,
      seriesKey: series.key,
      preferredCatalogSkuKey: series.preferredCatalogSkuKey,
      tcgMarketPriceCents: series.currentTcgMarketPriceCents,
      tcgLowPriceCents: series.currentTcgLowPriceCents,
      tcgHighPriceCents: series.currentTcgHighPriceCents,
      listingCount: series.currentListingCount,
      manapoolPriceCents: series.currentManapoolPriceCents,
      manapoolQuantity: series.currentManapoolQuantity,
      pricingUpdatedAt: series.lastSnapshotAt ?? series.lastResolvedAt,
    }))
    .sort((left, right) => Number(right.matched) - Number(left.matched))
}

function buildProductPriceOptions(params: {
  product: CatalogProductDoc
  sku?: CatalogSkuDoc | null
}) {
  const { product, sku } = params

  return getTrackedPrintingDefinitions(product)
    .map((definition) => ({
      key: definition.printingKey,
      label: definition.printingLabel,
      printingKey: definition.printingKey,
      printingLabel: definition.printingLabel,
      skuVariantCode: definition.skuVariantCode,
      matched:
        (typeof sku?.variantCode === 'string' &&
          definition.skuVariantCode === sku.variantCode) ||
        (!sku && definition.printingKey === 'normal'),
      source: 'product' as const,
      tcgMarketPriceCents: definition.tcgMarketPriceCents,
      tcgLowPriceCents: definition.tcgLowPriceCents,
      tcgHighPriceCents: definition.tcgHighPriceCents,
      manapoolPriceCents: definition.manapoolPriceCents,
      manapoolQuantity: definition.manapoolQuantity,
      pricingUpdatedAt: product.pricingUpdatedAt,
    }))
    .sort((left, right) => Number(right.matched) - Number(left.matched))
}

function pickSelectedOption(options: Array<InventoryPriceOption>) {
  return (
    options.find((option) => option.matched) ??
    options.find((option) => option.printingKey === 'normal') ??
    options[0]
  )
}

export function buildInventoryPriceSummary(params: {
  product: CatalogProductDoc
  sku?: CatalogSkuDoc | null
  trackedSeries: Array<PricingTrackedSeriesDoc>
}): InventoryPriceSummary {
  const trackedSeriesOptions = buildTrackedSeriesPriceOptions(params)

  if (trackedSeriesOptions.length > 0) {
    return {
      selected: pickSelectedOption(trackedSeriesOptions),
      options: trackedSeriesOptions,
      source: 'tracked_series',
      skuPricing:
        params.sku
          ? {
              marketPriceCents: params.sku.marketPriceCents,
              lowPriceCents: params.sku.lowPriceCents,
              highPriceCents: params.sku.highPriceCents,
              listingCount: params.sku.listingCount,
              pricingUpdatedAt: params.sku.pricingUpdatedAt,
            }
          : null,
    }
  }

  const productOptions = buildProductPriceOptions(params)

  if (productOptions.length > 0) {
    return {
      selected: pickSelectedOption(productOptions),
      options: productOptions,
      source: 'product',
      skuPricing:
        params.sku
          ? {
              marketPriceCents: params.sku.marketPriceCents,
              lowPriceCents: params.sku.lowPriceCents,
              highPriceCents: params.sku.highPriceCents,
              listingCount: params.sku.listingCount,
              pricingUpdatedAt: params.sku.pricingUpdatedAt,
            }
          : null,
    }
  }

  if (params.sku) {
    return {
      selected: null,
      options: [],
      source: 'sku',
      skuPricing: {
        marketPriceCents: params.sku.marketPriceCents,
        lowPriceCents: params.sku.lowPriceCents,
        highPriceCents: params.sku.highPriceCents,
        listingCount: params.sku.listingCount,
        pricingUpdatedAt: params.sku.pricingUpdatedAt,
      },
    }
  }

  return {
    selected: null,
    options: [],
    source: 'unavailable',
    skuPricing: null,
  }
}

export function resolveInventoryPriceCents(
  summary: InventoryPriceSummary,
  field: InventoryResolvedPriceField,
): number | undefined {
  const selectedValue =
    field === 'market'
      ? summary.selected?.tcgMarketPriceCents
      : field === 'low'
        ? summary.selected?.tcgLowPriceCents
        : summary.selected?.tcgHighPriceCents

  if (typeof selectedValue === 'number') {
    return selectedValue
  }

  if (!summary.skuPricing) {
    return undefined
  }

  return (
    field === 'market'
      ? summary.skuPricing.marketPriceCents
      : field === 'low'
        ? summary.skuPricing.lowPriceCents
        : summary.skuPricing.highPriceCents
  )
}

export function buildInventoryExtendedPriceCents(
  unitPriceCents: number | undefined,
  quantity: number,
) {
  if (typeof unitPriceCents !== 'number') {
    return undefined
  }

  return unitPriceCents * quantity
}

export function buildInventoryProductSummary(product: CatalogProductDoc) {
  return {
    key: product.key,
    name: product.name,
    cleanName: product.cleanName,
    categoryKey: product.categoryKey,
    setKey: product.setKey,
    tcgplayerUrl:
      product.tcgplayerUrl ??
      buildTcgplayerProductUrl(product.tcgplayerProductId),
    number: product.number,
    rarity: product.rarity,
    finishes: product.finishes ?? [],
    tcgplayerProductId: product.tcgplayerProductId,
    pricingUpdatedAt: product.pricingUpdatedAt,
    skuPricingUpdatedAt: product.skuPricingUpdatedAt,
    manapoolQuantity: product.manapoolQuantity,
  }
}

export function buildInventorySkuSummary(sku?: CatalogSkuDoc | null) {
  return sku
    ? {
        key: sku.key,
        tcgplayerSku: sku.tcgplayerSku,
        conditionCode: sku.conditionCode,
        variantCode: sku.variantCode,
        languageCode: sku.languageCode,
        marketPriceCents: sku.marketPriceCents,
        lowPriceCents: sku.lowPriceCents,
        highPriceCents: sku.highPriceCents,
        listingCount: sku.listingCount,
        pricingUpdatedAt: sku.pricingUpdatedAt,
      }
    : null
}

export function buildInventorySetSummary(set?: { key: string; name: string; categoryKey: string; categoryDisplayName: string; abbreviation?: string; publishedOn?: string } | null) {
  return set
    ? {
        key: set.key,
        name: set.name,
        categoryKey: set.categoryKey,
        categoryDisplayName: set.categoryDisplayName,
        abbreviation: set.abbreviation,
        publishedOn: set.publishedOn,
      }
    : null
}
