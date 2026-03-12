import { buildInventoryExtendedPriceCents, buildInventoryPriceSummary, buildInventoryProductSummary, buildInventorySetSummary, buildInventorySkuSummary, resolveInventoryPriceCents } from './pricing'
import type {
  CatalogProductDoc,
  CatalogSetDoc,
  CatalogSkuDoc,
  InventoryAggregateAccumulator,
  InventoryContentDoc,
  InventoryLocationDoc,
  InventoryUnitDetailDoc,
  PricingTrackedSeriesDoc,
} from '../shared/types'

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
    product: buildInventoryProductSummary(product),
    set: buildInventorySetSummary(set),
    sku: buildInventorySkuSummary(sku),
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
    product: buildInventoryProductSummary(product),
    set: buildInventorySetSummary(set),
    sku: buildInventorySkuSummary(sku),
    price,
  }
}
