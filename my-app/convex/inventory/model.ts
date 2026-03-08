import { getTrackedPrintingDefinitions } from '../pricing/normalizers'
import type { Doc } from '../_generated/dataModel'

type InventoryItemDoc = Doc<'inventoryItems'>
type CatalogProductDoc = Doc<'catalogProducts'>
type CatalogSkuDoc = Doc<'catalogSkus'>
type CatalogSetDoc = Doc<'catalogSets'>
type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

export type InventoryMetadataField = {
  key: string
  value: string
}

export type InventoryType = InventoryItemDoc['inventoryType']

export type InventoryPriceOption = {
  key: string
  label: string
  printingKey?: string
  printingLabel?: string
  skuVariantCode?: string
  matched: boolean
  source: 'tracked_series' | 'product'
  seriesKey?: string
  preferredCatalogSkuKey?: string
  tcgMarketPriceCents?: number
  tcgLowPriceCents?: number
  tcgHighPriceCents?: number
  listingCount?: number
  manapoolPriceCents?: number
  manapoolQuantity?: number
  pricingUpdatedAt?: number
}

export type InventoryPriceSummary = {
  selected: InventoryPriceOption | null
  options: Array<InventoryPriceOption>
  source: 'tracked_series' | 'sku' | 'product' | 'unavailable'
  skuPricing: null | {
    marketPriceCents?: number
    lowPriceCents?: number
    highPriceCents?: number
    listingCount?: number
    pricingUpdatedAt?: number
  }
}

export type InventoryResolvedPriceField = 'market' | 'low' | 'high'

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

export function normalizeInventoryMetadataFields(
  metadataFields: Array<InventoryMetadataField> | undefined,
): Array<InventoryMetadataField> | undefined {
  if (!metadataFields) {
    return undefined
  }

  const normalizedFields = metadataFields
    .map((field) => ({
      key: normalizeOptionalString(field.key),
      value: normalizeOptionalString(field.value),
    }))
    .filter(
      (
        field,
      ): field is {
        key: string
        value: string
      } => Boolean(field.key && field.value),
    )

  return normalizedFields.length > 0 ? normalizedFields : undefined
}

export function normalizeInventoryQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Inventory quantity must be a non-negative integer')
  }

  return quantity
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

export function buildTcgplayerProductUrl(
  tcgplayerProductId: number | undefined,
): string | undefined {
  if (
    typeof tcgplayerProductId !== 'number' ||
    !Number.isFinite(tcgplayerProductId)
  ) {
    return undefined
  }

  return `https://www.tcgplayer.com/product/${tcgplayerProductId}`
}

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

export function buildInventoryListRow(params: {
  item: InventoryItemDoc
  product: CatalogProductDoc
  sku?: CatalogSkuDoc | null
  set?: CatalogSetDoc | null
  trackedSeries: Array<PricingTrackedSeriesDoc>
}) {
  const { item, product, sku, set, trackedSeries } = params
  const price = buildInventoryPriceSummary({
    product,
    sku,
    trackedSeries,
  })
  const resolvedMarketPriceCents = resolveInventoryPriceCents(price, 'market')
  const resolvedLowPriceCents = resolveInventoryPriceCents(price, 'low')
  const resolvedHighPriceCents = resolveInventoryPriceCents(price, 'high')

  return {
    _id: item._id,
    inventoryType: item.inventoryType,
    quantity: item.quantity,
    location: item.location,
    notes: item.notes,
    metadataFields: item.metadataFields ?? [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    product: {
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
    },
    set: set
      ? {
          key: set.key,
          name: set.name,
          categoryKey: set.categoryKey,
          categoryDisplayName: set.categoryDisplayName,
          abbreviation: set.abbreviation,
          publishedOn: set.publishedOn,
        }
      : null,
    sku: sku
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
      : null,
    price: {
      ...price,
      resolvedMarketPriceCents,
      resolvedLowPriceCents,
      resolvedHighPriceCents,
      totalMarketPriceCents: buildInventoryExtendedPriceCents(
        resolvedMarketPriceCents,
        item.quantity,
      ),
      totalLowPriceCents: buildInventoryExtendedPriceCents(
        resolvedLowPriceCents,
        item.quantity,
      ),
      totalHighPriceCents: buildInventoryExtendedPriceCents(
        resolvedHighPriceCents,
        item.quantity,
      ),
    },
  }
}
