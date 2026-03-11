import type { Doc, Id } from '../../_generated/dataModel'

export type TrackingRuleDoc = Doc<'pricingTrackingRules'>

export function buildSyncIssueKey(setKey: string) {
  return `sync:${setKey}`
}

export function buildTrackedSeriesSearchText(params: {
  name: string
  printingLabel: string
  catalogProductKey: string
}) {
  return `${params.name} ${params.printingLabel} ${params.catalogProductKey}`
}

export function isActiveUnignoredIssue(issue: {
  active?: boolean
  ignoredAt?: number
}) {
  return issue.active === true && !issue.ignoredAt
}

export function buildDefaultRuleLabel(params: {
  ruleType: TrackingRuleDoc['ruleType']
  name: string
}) {
  if (params.ruleType === 'manual_product') {
    return `Track ${params.name}`
  }

  if (params.ruleType === 'set') {
    return `Track set ${params.name}`
  }

  return `Track category ${params.name}`
}

export function seriesNeedsPatch(
  existing: Doc<'pricingTrackedSeries'>,
  desired: {
    catalogProductKey: string
    categoryKey: string
    setKey: string
    name: string
    number?: string
    rarity?: string
    printingKey: string
    printingLabel: string
    skuVariantCode?: string
    activeRuleCount: number
    active: boolean
  },
) {
  return (
    existing.catalogProductKey !== desired.catalogProductKey ||
    existing.categoryKey !== desired.categoryKey ||
    existing.setKey !== desired.setKey ||
    existing.name !== desired.name ||
    existing.number !== desired.number ||
    existing.rarity !== desired.rarity ||
    existing.printingKey !== desired.printingKey ||
    existing.printingLabel !== desired.printingLabel ||
    existing.skuVariantCode !== desired.skuVariantCode ||
    existing.activeRuleCount !== desired.activeRuleCount ||
    existing.active !== desired.active
  )
}

export function seriesSnapshotNeedsPatch(
  existing: Doc<'pricingTrackedSeries'>,
  desired: {
    pricingSource: Doc<'pricingTrackedSeries'>['pricingSource']
    preferredCatalogSkuKey?: string
    preferredTcgplayerSku?: number
    currentTcgMarketPriceCents?: number
    currentTcgLowPriceCents?: number
    currentTcgHighPriceCents?: number
    currentListingCount?: number
    currentManapoolPriceCents?: number
    currentManapoolQuantity?: number
  },
) {
  return (
    existing.pricingSource !== desired.pricingSource ||
    existing.preferredCatalogSkuKey !== desired.preferredCatalogSkuKey ||
    existing.preferredTcgplayerSku !== desired.preferredTcgplayerSku ||
    existing.currentTcgMarketPriceCents !== desired.currentTcgMarketPriceCents ||
    existing.currentTcgLowPriceCents !== desired.currentTcgLowPriceCents ||
    existing.currentTcgHighPriceCents !== desired.currentTcgHighPriceCents ||
    existing.currentListingCount !== desired.currentListingCount ||
    existing.currentManapoolPriceCents !== desired.currentManapoolPriceCents ||
    existing.currentManapoolQuantity !== desired.currentManapoolQuantity
  )
}

export function joinNeedsPatch(
  existing: Doc<'pricingTrackedSeriesRules'>,
  desired: {
    ruleId: Id<'pricingTrackingRules'>
    seriesKey: string
    setKey: string
  },
) {
  return (
    existing.ruleId !== desired.ruleId ||
    existing.seriesKey !== desired.seriesKey ||
    existing.setKey !== desired.setKey ||
    !existing.active
  )
}
