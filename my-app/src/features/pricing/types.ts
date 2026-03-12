import type { Doc, Id } from '../../../convex/_generated/dataModel'

export type CatalogSetSync = {
  pricingSyncStatus: string
  pendingSyncMode?: string
  scopedSetCount?: number
  pendingSetCount?: number
  syncingSetCount?: number
  errorSetCount?: number
  syncedProductCount: number
  syncedSkuCount: number
}

export type TrackingRule = {
  _id: Id<'pricingTrackingRules'>
  ruleType: 'manual_product' | 'set' | 'category'
  categoryGroupKey: string
  categoryGroupLabel: string
  setGroupKey?: string
  setGroupLabel?: string
  scopeLabel: string
  label: string
  active: boolean
  categoryKey?: string
  setKey?: string
  catalogProductKey?: string
  autoTrackFutureSets?: boolean
  createdAt: number
  updatedAt: number
  activeSeriesCount: number
  catalogSetSync?: CatalogSetSync
}

export type TrackedSeries = Doc<'pricingTrackedSeries'>
export type TabKey = 'rules' | 'series' | 'issues'

export type PricingStats = {
  totalTrackedSeries: number
  totalActiveTrackedSeries: number
  totalRules: number
  totalActiveRules: number
  totalIssues: number
  totalActiveIssues: number
}
