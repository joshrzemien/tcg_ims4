import { v } from 'convex/values'
import { categoryRuleAppliesToSetAtTime } from '../../pricing/ruleScope'

const SYNC_RETRY_BACKOFF_MS = [
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]

export const setSyncModeValidator = v.union(
  v.literal('full'),
  v.literal('pricing_only'),
)

export function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export function latestSourceTimestamp(set: {
  modifiedOn?: string
  productsModifiedAt?: string
  pricingModifiedAt?: string
  skusModifiedAt?: string
}): number | undefined {
  const timestamps = [
    toTimestamp(set.modifiedOn),
    toTimestamp(set.productsModifiedAt),
    toTimestamp(set.pricingModifiedAt),
    toTimestamp(set.skusModifiedAt),
  ].filter((value): value is number => typeof value === 'number')

  if (timestamps.length === 0) {
    return undefined
  }

  return Math.max(...timestamps)
}

export function getRetryDelayMs(consecutiveFailureCount: number): number {
  const index = Math.max(
    0,
    Math.min(consecutiveFailureCount - 1, SYNC_RETRY_BACKOFF_MS.length - 1),
  )
  return SYNC_RETRY_BACKOFF_MS[index]
}

export function hasSetSourceChanged(
  existing: {
    modifiedOn?: string
    productsModifiedAt?: string
    pricingModifiedAt?: string
    skusModifiedAt?: string
    productCount: number
    skuCount: number
  },
  incoming: {
    modifiedOn?: string
    productsModifiedAt?: string
    pricingModifiedAt?: string
    skusModifiedAt?: string
    productCount: number
    skuCount: number
  },
): boolean {
  return (
    existing.modifiedOn !== incoming.modifiedOn ||
    existing.productsModifiedAt !== incoming.productsModifiedAt ||
    existing.pricingModifiedAt !== incoming.pricingModifiedAt ||
    existing.skusModifiedAt !== incoming.skusModifiedAt ||
    existing.productCount !== incoming.productCount ||
    existing.skuCount !== incoming.skuCount
  )
}

export function buildRuleScopeState(activeRules: Array<any>) {
  const directSetKeys = new Set<string>()
  const categoryRulesByCategoryKey = new Map<string, Array<any>>()

  for (const rule of activeRules) {
    if (!rule.active) {
      continue
    }

    if ((rule.ruleType === 'set' || rule.ruleType === 'manual_product') && rule.setKey) {
      directSetKeys.add(rule.setKey)
      continue
    }

    if (rule.ruleType === 'category' && rule.categoryKey) {
      const categoryRules = categoryRulesByCategoryKey.get(rule.categoryKey) ?? []
      categoryRules.push(rule)
      categoryRulesByCategoryKey.set(rule.categoryKey, categoryRules)
    }
  }

  return {
    directSetKeys,
    categoryRulesByCategoryKey,
  }
}

export function isSetInDerivedRuleScope(
  set: {
    key: string
    categoryKey: string
  },
  ruleScopeState: ReturnType<typeof buildRuleScopeState>,
  creationTime: number,
) {
  if (ruleScopeState.directSetKeys.has(set.key)) {
    return true
  }

  const categoryRules =
    ruleScopeState.categoryRulesByCategoryKey.get(set.categoryKey) ?? []

  return categoryRules.some((rule) =>
    categoryRuleAppliesToSetAtTime(rule, {
      categoryKey: set.categoryKey,
      _creationTime: creationTime,
    }),
  )
}

export function computeHasSourceChanges(params: {
  inRuleScope: boolean
  latestSourceUpdatedAt?: number
  lastSyncedAt?: number
}) {
  if (!params.inRuleScope) {
    return false
  }

  if (
    typeof params.latestSourceUpdatedAt !== 'number' ||
    typeof params.lastSyncedAt !== 'number'
  ) {
    return false
  }

  return params.latestSourceUpdatedAt > params.lastSyncedAt
}

export function isSetProcessing(existing: {
  syncStatus: 'pending' | 'syncing' | 'ready' | 'error'
  pricingSyncStatus: 'idle' | 'syncing' | 'error'
}) {
  return (
    existing.syncStatus === 'syncing' ||
    existing.pricingSyncStatus === 'syncing'
  )
}
