import { query } from '../../_generated/server'
import { getZeroDashboardStats } from '../dashboardReadModel'
import { categoryRuleAppliesToSet } from '../ruleScope'

export const listRules = query({
  args: {},
  handler: async (ctx) => {
    const [rules, ruleStats] = await Promise.all([
      ctx.db.query('pricingTrackingRules').collect(),
      ctx.db.query('pricingRuleDashboardStats').collect(),
    ])
    const activeSeriesCounts = new Map(
      ruleStats.map((stats) => [stats.ruleId, stats.activeSeriesCount]),
    )

    function summarizeCatalogSync(sets: Array<any>) {
      if (sets.length === 0) {
        return {
          pricingSyncStatus: 'idle',
          scopedSetCount: 0,
          pendingSetCount: 0,
          syncingSetCount: 0,
          errorSetCount: 0,
          syncedProductCount: 0,
          syncedSkuCount: 0,
        }
      }

      const syncingSetCount = sets.filter(
        (set) => set.pricingSyncStatus === 'syncing',
      ).length
      const errorSetCount = sets.filter(
        (set) => set.pricingSyncStatus === 'error',
      ).length
      const pendingSets = sets.filter(
        (set) => typeof set.pendingSyncMode === 'string',
      )
      const pendingModes = [...new Set(pendingSets.map((set) => set.pendingSyncMode))]

      return {
        pricingSyncStatus: syncingSetCount > 0 ? 'syncing' : 'idle',
        pendingSyncMode: pendingModes.length === 1 ? pendingModes[0] : undefined,
        scopedSetCount: sets.length,
        pendingSetCount: pendingSets.length,
        syncingSetCount,
        errorSetCount,
        syncedProductCount: sets.reduce(
          (sum, set) => sum + set.syncedProductCount,
          0,
        ),
        syncedSkuCount: sets.reduce(
          (sum, set) => sum + set.syncedSkuCount,
          0,
        ),
      }
    }

    return await Promise.all(
      rules
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(async (rule) => {
          let catalogSetSync
          if (rule.setKey) {
            const set = await ctx.db
              .query('catalogSets')
              .withIndex('by_key', (q) => q.eq('key', rule.setKey!))
              .unique()
            catalogSetSync = summarizeCatalogSync(set ? [set] : [])
          } else if (rule.ruleType === 'category' && rule.categoryKey) {
            const sets = await ctx.db
              .query('catalogSets')
              .withIndex('by_categoryKey', (q) =>
                q.eq('categoryKey', rule.categoryKey!),
              )
              .collect()
            catalogSetSync = summarizeCatalogSync(
              sets.filter((set) => categoryRuleAppliesToSet(rule, set)),
            )
          }

          return {
            categoryGroupKey:
              rule.categoryGroupKey ?? `ungrouped:${rule._id}`,
            categoryGroupLabel: rule.categoryGroupLabel ?? 'Ungrouped',
            setGroupKey: rule.setGroupKey,
            setGroupLabel: rule.setGroupLabel,
            scopeLabel:
              rule.scopeLabel ??
              rule.catalogProductKey ??
              rule.setKey ??
              rule.categoryKey ??
              '--',
            _id: rule._id,
            ruleType: rule.ruleType,
            label: rule.label,
            active: rule.active,
            categoryKey: rule.categoryKey,
            setKey: rule.setKey,
            catalogProductKey: rule.catalogProductKey,
            autoTrackFutureSets: rule.autoTrackFutureSets,
            createdAt: rule.createdAt,
            updatedAt: rule.updatedAt,
            activeSeriesCount: activeSeriesCounts.get(rule._id) ?? 0,
            catalogSetSync,
          }
        }),
    )
  },
})

export const getPricingStats = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db
      .query('pricingDashboardStats')
      .withIndex('by_key', (q) => q.eq('key', 'global'))
      .unique()

    return stats ?? getZeroDashboardStats()
  },
})
