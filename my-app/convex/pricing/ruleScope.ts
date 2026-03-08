import type { Doc } from '../_generated/dataModel'

type RuleScopeCtx = {
  db: any
}

type TrackingRuleDoc = Doc<'pricingTrackingRules'>
type CatalogSetDoc = Doc<'catalogSets'>

export function categoryRuleAppliesToSetAtTime(
  rule: TrackingRuleDoc,
  set: {
    categoryKey: string
    _creationTime: number
  },
) {
  if (rule.ruleType !== 'category' || rule.categoryKey !== set.categoryKey) {
    return false
  }

  const setExistedBeforeRule = set._creationTime < rule.createdAt
  if (setExistedBeforeRule) {
    return rule.seedExistingSets !== false
  }

  return rule.autoTrackFutureSets !== false
}

export function categoryRuleAppliesToSet(
  rule: TrackingRuleDoc,
  set: CatalogSetDoc,
) {
  return categoryRuleAppliesToSetAtTime(rule, set)
}

export async function listRuleScopedSetKeys(
  ctx: RuleScopeCtx,
  options?: {
    sets?: Array<Doc<'catalogSets'>>
  },
): Promise<Set<string>> {
  const [activeRules, sets] = await Promise.all([
    ctx.db
      .query('pricingTrackingRules')
      .withIndex('by_active', (q: any) => q.eq('active', true))
      .collect(),
    options?.sets
      ? Promise.resolve(options.sets)
      : ctx.db.query('catalogSets').collect(),
  ])

  const eligibleSetKeys = new Set<string>()
  const directSetKeys = new Set<string>()
  const categoryRulesByCategoryKey = new Map<string, Array<TrackingRuleDoc>>()
  const manualProductKeysNeedingLookup: Array<string> = []

  for (const rule of activeRules) {
    if (rule.ruleType === 'set' && rule.setKey) {
      directSetKeys.add(rule.setKey)
      continue
    }

    if (rule.ruleType === 'category' && rule.categoryKey) {
      const categoryRules =
        categoryRulesByCategoryKey.get(rule.categoryKey) ?? []
      categoryRules.push(rule)
      categoryRulesByCategoryKey.set(rule.categoryKey, categoryRules)
      continue
    }

    if (rule.ruleType === 'manual_product' && rule.setKey) {
      directSetKeys.add(rule.setKey)
      continue
    }

    if (rule.ruleType === 'manual_product' && rule.catalogProductKey) {
      manualProductKeysNeedingLookup.push(rule.catalogProductKey)
    }
  }

  for (const set of sets) {
    if (directSetKeys.has(set.key)) {
      eligibleSetKeys.add(set.key)
      continue
    }

    const categoryRules = categoryRulesByCategoryKey.get(set.categoryKey) ?? []
    if (categoryRules.some((rule) => categoryRuleAppliesToSet(rule, set))) {
      eligibleSetKeys.add(set.key)
    }
  }

  for (const catalogProductKey of manualProductKeysNeedingLookup) {
    const product = await ctx.db
      .query('catalogProducts')
      .withIndex('by_key', (q: any) => q.eq('key', catalogProductKey))
      .unique()

    if (product) {
      eligibleSetKeys.add(product.setKey)
    }
  }

  return eligibleSetKeys
}

export async function isSetInRuleScope(
  ctx: RuleScopeCtx,
  set: Doc<'catalogSets'>,
): Promise<boolean> {
  const setKeys = await listRuleScopedSetKeys(ctx, {
    sets: [set],
  })

  return setKeys.has(set.key)
}
