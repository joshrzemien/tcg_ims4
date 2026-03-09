import { getTrackedPrintingDefinitions } from '../pricing/normalizers'
import type { Doc, Id } from '../_generated/dataModel'

type CatalogProductDoc = Doc<'catalogProducts'>
type CatalogSetDoc = Doc<'catalogSets'>
type CatalogSkuDoc = Doc<'catalogSkus'>
type InventoryContentDoc = Doc<'inventoryLocationContents'>
type InventoryLocationDoc = Doc<'inventoryLocations'>
type InventoryUnitDetailDoc = Doc<'inventoryUnitDetails'>
type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

export type InventoryClass = InventoryContentDoc['inventoryClass']
export type InventoryWorkflowStatus = InventoryContentDoc['workflowStatus']
export type InventoryLocationKind = InventoryLocationDoc['kind']

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

export type InventoryWorkflowBreakdown = Record<InventoryWorkflowStatus, number>

export type InventoryAggregateAccumulator = {
  aggregateKey: string
  inventoryClass: InventoryClass
  catalogProductKey: string
  catalogSkuKey?: string
  totalQuantity: number
  distinctLocationIds: Set<Id<'inventoryLocations'>>
  workflowBreakdown: InventoryWorkflowBreakdown
  latestUpdatedAt: number
  locationCodes: Set<string>
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${fieldName} is required`)
  }

  return normalized
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

export function normalizeInventoryQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Inventory quantity must be a non-negative integer')
  }

  return quantity
}

export function normalizeInventoryClass(
  inventoryClass: string,
): InventoryClass {
  if (
    inventoryClass !== 'single' &&
    inventoryClass !== 'sealed' &&
    inventoryClass !== 'graded'
  ) {
    throw new Error(`Unsupported inventory class: ${inventoryClass}`)
  }

  return inventoryClass
}

export function normalizeWorkflowStatus(
  workflowStatus: string | undefined,
): InventoryWorkflowStatus {
  if (
    workflowStatus === undefined ||
    workflowStatus === null ||
    workflowStatus === ''
  ) {
    return 'available'
  }

  if (
    workflowStatus !== 'available' &&
    workflowStatus !== 'processing' &&
    workflowStatus !== 'hold'
  ) {
    throw new Error(`Unsupported workflow status: ${workflowStatus}`)
  }

  return workflowStatus
}

export function normalizeLocationCode(code: string): string {
  const normalized = normalizeRequiredString(code, 'Location code')
  const segments = normalized.split(':').map((segment) => segment.trim())

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error('Location code must use non-empty colon-delimited segments')
  }

  if (
    segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    throw new Error(
      'Location code segments may only contain letters, numbers, underscores, and hyphens',
    )
  }

  return segments.map((segment) => segment.toUpperCase()).join(':')
}

export function parseLocationCode(code: string) {
  const normalizedCode = normalizeLocationCode(code)
  const pathSegments = normalizedCode.split(':')

  return {
    code: normalizedCode,
    pathSegments,
    depth: pathSegments.length,
  }
}

export function buildParentLocationCode(
  code: string,
): string | undefined {
  const { pathSegments } = parseLocationCode(code)

  if (pathSegments.length <= 1) {
    return undefined
  }

  return pathSegments.slice(0, -1).join(':')
}

export function buildContentAggregateKey(params: {
  inventoryClass: InventoryClass
  catalogProductKey: string
  catalogSkuKey?: string
}) {
  return [
    params.inventoryClass,
    normalizeRequiredString(params.catalogProductKey, 'catalogProductKey'),
    normalizeOptionalString(params.catalogSkuKey) ?? '_',
  ].join('|')
}

export function buildCatalogContentIdentityKey(params: {
  locationId: Id<'inventoryLocations'>
  inventoryClass: InventoryClass
  catalogProductKey: string
  catalogSkuKey?: string
}) {
  return [
    'catalog',
    params.locationId,
    params.inventoryClass,
    normalizeRequiredString(params.catalogProductKey, 'catalogProductKey'),
    normalizeOptionalString(params.catalogSkuKey) ?? '_',
  ].join('|')
}

export function buildPendingGradedContentIdentityKey(
  contentId: Id<'inventoryLocationContents'>,
) {
  return ['graded', 'pending', contentId].join('|')
}

export function buildUnitIdentityKey(params: {
  gradingCompany: string
  certNumber: string
}) {
  return [
    normalizeRequiredString(params.gradingCompany, 'gradingCompany').toUpperCase(),
    normalizeRequiredString(params.certNumber, 'certNumber').toUpperCase(),
  ].join('|')
}

export function buildGradedContentIdentityKey(params: {
  locationId: Id<'inventoryLocations'>
  unitIdentityKey: string
}) {
  return ['graded', params.locationId, params.unitIdentityKey].join('|')
}

export function validateInventoryContent(params: {
  inventoryClass: InventoryClass
  quantity: number
}) {
  const quantity = normalizeInventoryQuantity(params.quantity)

  if (params.inventoryClass === 'graded' && quantity !== 1) {
    throw new Error('Graded inventory content must have quantity 1')
  }

  return quantity
}

export function buildEmptyWorkflowBreakdown(): InventoryWorkflowBreakdown {
  return {
    available: 0,
    processing: 0,
    hold: 0,
  }
}

export function appendWorkflowBreakdown(
  breakdown: InventoryWorkflowBreakdown,
  workflowStatus: InventoryWorkflowStatus,
  quantity: number,
) {
  breakdown[workflowStatus] += quantity
  return breakdown
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

function buildPriceEnvelope(params: {
  product: CatalogProductDoc
  sku?: CatalogSkuDoc | null
  trackedSeries: Array<PricingTrackedSeriesDoc>
  quantity: number
}) {
  const price = buildInventoryPriceSummary(params)
  const resolvedMarketPriceCents = resolveInventoryPriceCents(price, 'market')
  const resolvedLowPriceCents = resolveInventoryPriceCents(price, 'low')
  const resolvedHighPriceCents = resolveInventoryPriceCents(price, 'high')

  return {
    ...price,
    resolvedMarketPriceCents,
    resolvedLowPriceCents,
    resolvedHighPriceCents,
    totalMarketPriceCents: buildInventoryExtendedPriceCents(
      resolvedMarketPriceCents,
      params.quantity,
    ),
    totalLowPriceCents: buildInventoryExtendedPriceCents(
      resolvedLowPriceCents,
      params.quantity,
    ),
    totalHighPriceCents: buildInventoryExtendedPriceCents(
      resolvedHighPriceCents,
      params.quantity,
    ),
  }
}

export function buildInventoryContentRow(params: {
  content: InventoryContentDoc
  location: InventoryLocationDoc
  product: CatalogProductDoc
  sku?: CatalogSkuDoc | null
  set?: CatalogSetDoc | null
  trackedSeries: Array<PricingTrackedSeriesDoc>
  unitDetail?: InventoryUnitDetailDoc | null
}) {
  const { content, location, product, sku, set, trackedSeries, unitDetail } = params
  const price = buildPriceEnvelope({
    product,
    sku,
    trackedSeries,
    quantity: content.quantity,
  })

  return {
    _id: content._id,
    inventoryClass: content.inventoryClass,
    quantity: content.quantity,
    workflowStatus: content.workflowStatus,
    workflowTag: content.workflowTag,
    notes: content.notes,
    contentIdentityKey: content.contentIdentityKey,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    location: {
      _id: location._id,
      code: location.code,
      kind: location.kind,
      pathSegments: location.pathSegments,
      depth: location.depth,
      acceptsContents: location.acceptsContents,
      displayName: location.displayName,
    },
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
    unitDetail: unitDetail
      ? {
          _id: unitDetail._id,
          unitKind: unitDetail.unitKind,
          gradingCompany: unitDetail.gradingCompany,
          gradeLabel: unitDetail.gradeLabel,
          gradeSortValue: unitDetail.gradeSortValue,
          certNumber: unitDetail.certNumber,
          notes: unitDetail.notes,
          unitIdentityKey: unitDetail.unitIdentityKey,
        }
      : null,
    price,
  }
}

export function buildInventoryAggregateRow(params: {
  aggregate: InventoryAggregateAccumulator
  product: CatalogProductDoc
  sku?: CatalogSkuDoc | null
  set?: CatalogSetDoc | null
  trackedSeries: Array<PricingTrackedSeriesDoc>
}) {
  const { aggregate, product, sku, set, trackedSeries } = params
  const price = buildPriceEnvelope({
    product,
    sku,
    trackedSeries,
    quantity: aggregate.totalQuantity,
  })

  return {
    aggregateKey: aggregate.aggregateKey,
    inventoryClass: aggregate.inventoryClass,
    totalQuantity: aggregate.totalQuantity,
    distinctLocationCount: aggregate.distinctLocationIds.size,
    locationCodes: [...aggregate.locationCodes].sort(),
    workflowBreakdown: aggregate.workflowBreakdown,
    updatedAt: aggregate.latestUpdatedAt,
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
    price,
  }
}
