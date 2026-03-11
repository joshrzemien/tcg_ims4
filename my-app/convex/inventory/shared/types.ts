import type { Doc, Id } from '../../_generated/dataModel'

export type CatalogProductDoc = Doc<'catalogProducts'>
export type CatalogSetDoc = Doc<'catalogSets'>
export type CatalogSkuDoc = Doc<'catalogSkus'>
export type InventoryContentDoc = Doc<'inventoryLocationContents'>
export type InventoryLocationDoc = Doc<'inventoryLocations'>
export type InventoryUnitDetailDoc = Doc<'inventoryUnitDetails'>
export type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

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
