import { v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'
import { getZeroDashboardStats } from './dashboardReadModel'
import { categoryRuleAppliesToSet, isSetInRuleScope } from './ruleScope'

const pricingSourceFilterValidator = v.union(
  v.literal('sku'),
  v.literal('product_fallback'),
  v.literal('unavailable'),
)

const pricingResolutionIssueTypeValidator = v.union(
  v.literal('ambiguous_nm_en_sku'),
  v.literal('unmapped_printing'),
  v.literal('missing_product_price'),
  v.literal('missing_manapool_match'),
  v.literal('sync_error'),
)

function clampLimit(limit: number | undefined, fallback = 50, max = 200) {
  return Math.max(1, Math.min(limit ?? fallback, max))
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0
  }

  const offset = Number(cursor)
  return Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0
}

function encodeCursor(offset: number) {
  return String(offset)
}

function paginateArray<T>(
  items: Array<T>,
  cursor: string | null | undefined,
  limit: number,
) {
  const offset = decodeCursor(cursor)
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + page.length

  return {
    page,
    continueCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
    isDone: nextOffset >= items.length,
  }
}

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

export const listTrackedSeries = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    categoryKey: v.optional(v.string()),
    setKey: v.optional(v.string()),
    pricingSource: v.optional(pricingSourceFilterValidator),
    search: v.optional(v.string()),
    printingKey: v.optional(v.string()),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allSeries =
      args.activeOnly && args.setKey
        ? await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_active_setKey', (q) =>
              q.eq('active', true).eq('setKey', args.setKey!),
            )
            .collect()
        : args.activeOnly
          ? await ctx.db
              .query('pricingTrackedSeries')
              .withIndex('by_active', (q) => q.eq('active', true))
              .collect()
          : args.setKey
            ? await ctx.db
                .query('pricingTrackedSeries')
                .withIndex('by_setKey', (q) => q.eq('setKey', args.setKey!))
                .collect()
            : args.categoryKey
              ? await ctx.db
                  .query('pricingTrackedSeries')
                  .withIndex('by_categoryKey', (q) =>
                    q.eq('categoryKey', args.categoryKey!),
                  )
                  .collect()
              : await ctx.db.query('pricingTrackedSeries').collect()
    const searchValue = args.search?.trim().toLowerCase()
    const filtered = allSeries
      .filter((series) =>
        args.activeOnly && args.setKey
          ? true
          : args.activeOnly
            ? series.active
            : true,
      )
      .filter((series) =>
        args.categoryKey ? series.categoryKey === args.categoryKey : true,
      )
      .filter((series) =>
        args.setKey && !(args.activeOnly && args.setKey)
          ? series.setKey === args.setKey
          : true,
      )
      .filter((series) =>
        args.pricingSource ? series.pricingSource === args.pricingSource : true,
      )
      .filter((series) =>
        args.printingKey ? series.printingKey === args.printingKey : true,
      )
      .filter((series) => {
        if (!searchValue) {
          return true
        }

        return (
          series.name.toLowerCase().includes(searchValue) ||
          series.printingLabel.toLowerCase().includes(searchValue) ||
          series.catalogProductKey.toLowerCase().includes(searchValue)
        )
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)

    return paginateArray(filtered, args.cursor, clampLimit(args.limit))
  },
})

export const getSeriesHistory = query({
  args: {
    seriesKey: v.string(),
    rangeDays: v.optional(v.number()),
  },
  handler: async (ctx, { seriesKey, rangeDays }) => {
    const cutoff =
      typeof rangeDays === 'number' &&
      Number.isFinite(rangeDays) &&
      rangeDays > 0
        ? Date.now() - rangeDays * 24 * 60 * 60 * 1000
        : null
    const historyQuery =
      typeof cutoff === 'number'
        ? ctx.db
            .query('pricingHistory')
            .withIndex('by_seriesKey_effectiveAt', (q) =>
              q.eq('seriesKey', seriesKey).gte('effectiveAt', cutoff),
            )
        : ctx.db
            .query('pricingHistory')
            .withIndex('by_seriesKey_effectiveAt', (q) =>
              q.eq('seriesKey', seriesKey),
            )

    return await historyQuery.collect()
  },
})

export const searchCatalogProducts = query({
  args: {
    search: v.string(),
    categoryKey: v.optional(v.string()),
    setKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { search, categoryKey, setKey, limit }) => {
    const normalizedSearch = search.trim()
    if (!normalizedSearch) {
      return []
    }

    const results = await ctx.db
      .query('catalogProducts')
      .withSearchIndex('search_cleanName', (q) => {
        let searchQuery = q.search('cleanName', normalizedSearch)
        if (categoryKey) {
          searchQuery = searchQuery.eq('categoryKey', categoryKey)
        }
        if (setKey) {
          searchQuery = searchQuery.eq('setKey', setKey)
        }
        return searchQuery
      })
      .take(clampLimit(limit, 20, 50))

    return results
  },
})

export const listResolutionIssues = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    setKey: v.optional(v.string()),
    categoryKey: v.optional(v.string()),
    issueType: v.optional(pricingResolutionIssueTypeValidator),
    includeIgnored: v.optional(v.boolean()),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const issues =
      args.activeOnly && args.setKey
        ? await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_setKey', (q) =>
              q.eq('active', true).eq('setKey', args.setKey!),
            )
            .collect()
        : args.activeOnly
          ? await ctx.db
              .query('pricingResolutionIssues')
              .withIndex('by_active', (q) => q.eq('active', true))
              .collect()
          : args.setKey
            ? await ctx.db
                .query('pricingResolutionIssues')
                .withIndex('by_setKey', (q) => q.eq('setKey', args.setKey!))
                .collect()
            : await ctx.db.query('pricingResolutionIssues').collect()
    const filtered = issues
      .filter((issue) => (args.activeOnly ? issue.active : true))
      .filter((issue) => (args.setKey ? issue.setKey === args.setKey : true))
      .filter((issue) =>
        args.categoryKey ? issue.categoryKey === args.categoryKey : true,
      )
      .filter((issue) =>
        args.issueType ? issue.issueType === args.issueType : true,
      )
      .filter((issue) => (args.includeIgnored ? true : !issue.ignoredAt))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)

    return paginateArray(filtered, args.cursor, clampLimit(args.limit))
  },
})

export const listStaleTrackedSetKeys = internalQuery({
  args: {
    thresholdMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { thresholdMs, limit }) => {
    const now = Date.now()
    const maxResults = clampLimit(limit, 25, 200)
    const activeSeries = await ctx.db
      .query('pricingTrackedSeries')
      .withIndex('by_active_setKey', (q) => q.eq('active', true))
      .collect()

    const distinctSetKeys = [
      ...new Set(activeSeries.map((series) => series.setKey)),
    ]
    const staleSets: Array<{
      setKey: string
      lastSyncedAt?: number
      ageMs: number
    }> = []

    for (const setKey of distinctSetKeys) {
      const set = await ctx.db
        .query('catalogSets')
        .withIndex('by_key', (q) => q.eq('key', setKey))
        .unique()

      if (!set) {
        continue
      }

      if (set.syncStatus === 'syncing' || set.pricingSyncStatus === 'syncing') {
        continue
      }

      const ageMs =
        typeof set.lastSyncedAt === 'number'
          ? now - set.lastSyncedAt
          : Number.POSITIVE_INFINITY

      if (ageMs <= thresholdMs) {
        continue
      }

      staleSets.push({
        setKey,
        ...(typeof set.lastSyncedAt === 'number'
          ? { lastSyncedAt: set.lastSyncedAt }
          : {}),
        ageMs,
      })
    }

    staleSets.sort((left, right) => right.ageMs - left.ageMs)
    return staleSets.slice(0, maxResults)
  },
})

export const getSetRuleScope = internalQuery({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }) => {
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      return {
        setKey,
        inRuleScope: false,
      }
    }

    return {
      setKey,
      inRuleScope: await isSetInRuleScope(ctx, set),
    }
  },
})
