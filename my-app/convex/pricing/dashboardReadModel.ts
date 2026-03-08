import type { Id } from '../_generated/dataModel'

type MutationCtx = {
  db: any
}

const GLOBAL_DASHBOARD_STATS_KEY = 'global'

const ZERO_DASHBOARD_STATS = {
  totalTrackedSeries: 0,
  totalActiveTrackedSeries: 0,
  totalRules: 0,
  totalActiveRules: 0,
  totalIssues: 0,
  totalActiveIssues: 0,
}

type DashboardStatsDelta = Partial<typeof ZERO_DASHBOARD_STATS>

function buildRuleStatsKey(ruleId: Id<'pricingTrackingRules'>) {
  return `rule:${ruleId}`
}

function clampCount(value: number) {
  return Math.max(0, value)
}

function buildSetLabel(set: {
  categoryDisplayName?: string
  name?: string
  key?: string
} | null) {
  if (!set) {
    return undefined
  }

  if (set.categoryDisplayName && set.name) {
    return `${set.categoryDisplayName} / ${set.name}`
  }

  return set.name ?? set.key
}

async function loadCategoryByKey(ctx: MutationCtx, categoryKey: string | undefined) {
  if (!categoryKey) {
    return null
  }

  return await ctx.db
    .query('catalogCategories')
    .withIndex('by_key', (q: any) => q.eq('key', categoryKey))
    .unique()
}

async function loadSetByKey(ctx: MutationCtx, setKey: string | undefined) {
  if (!setKey) {
    return null
  }

  return await ctx.db
    .query('catalogSets')
    .withIndex('by_key', (q: any) => q.eq('key', setKey))
    .unique()
}

async function loadProductByKey(
  ctx: MutationCtx,
  catalogProductKey: string | undefined,
) {
  if (!catalogProductKey) {
    return null
  }

  return await ctx.db
    .query('catalogProducts')
    .withIndex('by_key', (q: any) => q.eq('key', catalogProductKey))
    .unique()
}

export function getZeroDashboardStats() {
  return {
    ...ZERO_DASHBOARD_STATS,
  }
}

export async function setRuleActiveSeriesCount(
  ctx: MutationCtx,
  ruleId: Id<'pricingTrackingRules'>,
  activeSeriesCount: number,
  updatedAt = Date.now(),
) {
  const key = buildRuleStatsKey(ruleId)
  const existing = await ctx.db
    .query('pricingRuleDashboardStats')
    .withIndex('by_key', (q: any) => q.eq('key', key))
    .unique()

  const next = {
    key,
    ruleId,
    activeSeriesCount: clampCount(activeSeriesCount),
    updatedAt,
  }

  if (existing) {
    await ctx.db.patch('pricingRuleDashboardStats', existing._id, next)
    return { ...existing, ...next }
  }

  const statsId = await ctx.db.insert('pricingRuleDashboardStats', next)
  return await ctx.db.get('pricingRuleDashboardStats', statsId)
}

export async function deleteRuleDashboardStats(
  ctx: MutationCtx,
  ruleId: Id<'pricingTrackingRules'>,
) {
  const key = buildRuleStatsKey(ruleId)
  const existing = await ctx.db
    .query('pricingRuleDashboardStats')
    .withIndex('by_key', (q: any) => q.eq('key', key))
    .unique()

  if (!existing) {
    return false
  }

  await ctx.db.delete('pricingRuleDashboardStats', existing._id)
  return true
}

export async function ensureDashboardStats(ctx: MutationCtx) {
  const existing = await ctx.db
    .query('pricingDashboardStats')
    .withIndex('by_key', (q: any) => q.eq('key', GLOBAL_DASHBOARD_STATS_KEY))
    .unique()

  if (existing) {
    return existing
  }

  const updatedAt = Date.now()
  const statsId = await ctx.db.insert('pricingDashboardStats', {
    key: GLOBAL_DASHBOARD_STATS_KEY,
    ...ZERO_DASHBOARD_STATS,
    updatedAt,
  })

  return await ctx.db.get('pricingDashboardStats', statsId)
}

export async function applyDashboardStatsDelta(
  ctx: MutationCtx,
  delta: DashboardStatsDelta,
  updatedAt = Date.now(),
) {
  const existing = await ensureDashboardStats(ctx)
  const next = {
    totalTrackedSeries: clampCount(
      existing.totalTrackedSeries + (delta.totalTrackedSeries ?? 0),
    ),
    totalActiveTrackedSeries: clampCount(
      existing.totalActiveTrackedSeries + (delta.totalActiveTrackedSeries ?? 0),
    ),
    totalRules: clampCount(existing.totalRules + (delta.totalRules ?? 0)),
    totalActiveRules: clampCount(
      existing.totalActiveRules + (delta.totalActiveRules ?? 0),
    ),
    totalIssues: clampCount(existing.totalIssues + (delta.totalIssues ?? 0)),
    totalActiveIssues: clampCount(
      existing.totalActiveIssues + (delta.totalActiveIssues ?? 0),
    ),
    updatedAt,
  }

  await ctx.db.patch('pricingDashboardStats', existing._id, next)

  return next
}

export async function replaceDashboardStats(
  ctx: MutationCtx,
  stats: typeof ZERO_DASHBOARD_STATS,
  updatedAt = Date.now(),
) {
  const existing = await ctx.db
    .query('pricingDashboardStats')
    .withIndex('by_key', (q: any) => q.eq('key', GLOBAL_DASHBOARD_STATS_KEY))
    .unique()

  const next = {
    key: GLOBAL_DASHBOARD_STATS_KEY,
    totalTrackedSeries: clampCount(stats.totalTrackedSeries),
    totalActiveTrackedSeries: clampCount(stats.totalActiveTrackedSeries),
    totalRules: clampCount(stats.totalRules),
    totalActiveRules: clampCount(stats.totalActiveRules),
    totalIssues: clampCount(stats.totalIssues),
    totalActiveIssues: clampCount(stats.totalActiveIssues),
    updatedAt,
  }

  if (existing) {
    await ctx.db.patch('pricingDashboardStats', existing._id, next)
    return { ...existing, ...next }
  }

  const statsId = await ctx.db.insert('pricingDashboardStats', next)
  return await ctx.db.get('pricingDashboardStats', statsId)
}

export async function refreshRuleDashboardFields(
  ctx: MutationCtx,
  ruleId: Id<'pricingTrackingRules'>,
) {
  const rule = await ctx.db.get('pricingTrackingRules', ruleId)
  if (!rule) {
    return null
  }

  let scopeLabel =
    rule.catalogProductKey ?? rule.setKey ?? rule.categoryKey ?? '--'
  let categoryGroupKey = `ungrouped:${rule._id}`
  let categoryGroupLabel = 'Ungrouped'
  let setGroupKey: string | undefined
  let setGroupLabel: string | undefined

  if (rule.ruleType === 'category') {
    const category = await loadCategoryByKey(ctx, rule.categoryKey)

    scopeLabel = category?.displayName ?? rule.categoryKey ?? '--'
    categoryGroupKey = rule.categoryKey ?? `ungrouped:${rule._id}`
    categoryGroupLabel = category?.displayName ?? rule.categoryKey ?? 'Ungrouped'
  } else if (rule.ruleType === 'set') {
    const set = await loadSetByKey(ctx, rule.setKey)
    const setLabel = buildSetLabel(set)

    scopeLabel = setLabel ?? rule.setKey ?? '--'
    categoryGroupKey = set?.categoryKey ?? `ungrouped:${rule._id}`
    categoryGroupLabel =
      set?.categoryDisplayName ?? set?.categoryKey ?? 'Ungrouped'
    setGroupKey = set?.key ?? rule.setKey
    setGroupLabel = setLabel ?? rule.setKey
  } else {
    const product = await loadProductByKey(ctx, rule.catalogProductKey)
    const set = await loadSetByKey(ctx, product?.setKey)
    const setLabel = buildSetLabel(set)

    scopeLabel =
      product?.name && setLabel
        ? `${setLabel} / ${product.name}`
        : product?.name ?? rule.catalogProductKey ?? '--'
    categoryGroupKey = product?.categoryKey ?? `ungrouped:${rule._id}`
    categoryGroupLabel =
      set?.categoryDisplayName ?? product?.categoryKey ?? 'Ungrouped'
    setGroupKey = product?.setKey
    setGroupLabel = setLabel
  }

  await ctx.db.patch('pricingTrackingRules', rule._id, {
    scopeLabel,
    categoryGroupKey,
    categoryGroupLabel,
    setGroupKey,
    setGroupLabel,
  })

  return {
    scopeLabel,
    categoryGroupKey,
    categoryGroupLabel,
    setGroupKey,
    setGroupLabel,
  }
}

export async function refreshRuleDashboardFieldsForCategory(
  ctx: MutationCtx,
  categoryKey: string,
) {
  const rules = await ctx.db
    .query('pricingTrackingRules')
    .withIndex('by_categoryKey', (q: any) => q.eq('categoryKey', categoryKey))
    .collect()

  for (const rule of rules) {
    await refreshRuleDashboardFields(ctx, rule._id)
  }
}

export async function refreshRuleDashboardFieldsForSet(
  ctx: MutationCtx,
  setKey: string,
) {
  const rules = await ctx.db
    .query('pricingTrackingRules')
    .withIndex('by_setKey', (q: any) => q.eq('setKey', setKey))
    .collect()

  for (const rule of rules) {
    await refreshRuleDashboardFields(ctx, rule._id)
  }
}

export async function refreshRuleDashboardFieldsForProductKeys(
  ctx: MutationCtx,
  productKeys: Array<string>,
) {
  const seenRuleIds = new Set<Id<'pricingTrackingRules'>>()

  for (const productKey of productKeys) {
    const rules = await ctx.db
      .query('pricingTrackingRules')
      .withIndex('by_catalogProductKey', (q: any) =>
        q.eq('catalogProductKey', productKey),
      )
      .collect()

    for (const rule of rules) {
      if (seenRuleIds.has(rule._id)) {
        continue
      }

      seenRuleIds.add(rule._id)
      await refreshRuleDashboardFields(ctx, rule._id)
    }
  }
}
