import { paginationOptsValidator } from 'convex/server'
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

function normalizeCatalogProductSearch(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function getCatalogProductSearchName(product: { cleanName: string; name: string }) {
  return product.cleanName || product.name
}

function rankCatalogProductSearchResults<
  T extends { key: string; cleanName: string; name: string },
>(results: Array<T>, normalizedSearch: string) {
  return [...results].sort((left, right) => {
    const leftName = normalizeCatalogProductSearch(
      getCatalogProductSearchName(left),
    )
    const rightName = normalizeCatalogProductSearch(
      getCatalogProductSearchName(right),
    )

    const leftExact = leftName === normalizedSearch
    const rightExact = rightName === normalizedSearch
    if (leftExact !== rightExact) {
      return leftExact ? -1 : 1
    }

    const leftPrefix = leftName.startsWith(normalizedSearch)
    const rightPrefix = rightName.startsWith(normalizedSearch)
    if (leftPrefix !== rightPrefix) {
      return leftPrefix ? -1 : 1
    }

    const leftContains = leftName.includes(normalizedSearch)
    const rightContains = rightName.includes(normalizedSearch)
    if (leftContains !== rightContains) {
      return leftContains ? -1 : 1
    }

    const lengthDelta = leftName.length - rightName.length
    if (lengthDelta !== 0) {
      return lengthDelta
    }

    return left.key.localeCompare(right.key)
  })
}

async function paginateFilteredQuery<T>({
  paginationOpts,
  fetchPage,
  predicate,
}: {
  paginationOpts: {
    cursor: string | null
    numItems: number
  }
  fetchPage: (paginationOpts: {
    cursor: string | null
    numItems: number
  }) => Promise<{
    page: Array<T>
    continueCursor: string | null
    isDone: boolean
  }>
  predicate: (value: T) => boolean
}) {
  let cursor = paginationOpts.cursor
  let continueCursor: string | null = cursor
  let isDone = false
  let page: Array<T> = []
  let attempts = 0

  do {
    const next = await fetchPage({
      cursor,
      numItems: paginationOpts.numItems,
    })
    page = next.page.filter(predicate)
    continueCursor = next.continueCursor
    isDone = next.isDone
    cursor = next.continueCursor
    attempts += 1
  } while (page.length === 0 && !isDone && attempts < 5)

  return {
    page,
    continueCursor,
    isDone,
  }
}

function matchesTrackedSeriesFilters(
  series: {
    active: boolean
    categoryKey: string
    setKey: string
    pricingSource: string
    printingKey: string
    name: string
    printingLabel: string
    catalogProductKey: string
  },
  args: {
    activeOnly?: boolean
    categoryKey?: string
    setKey?: string
    pricingSource?: string
    printingKey?: string
    search?: string
  },
) {
  if (args.activeOnly && !series.active) {
    return false
  }
  if (args.categoryKey && series.categoryKey !== args.categoryKey) {
    return false
  }
  if (args.setKey && series.setKey !== args.setKey) {
    return false
  }
  if (args.pricingSource && series.pricingSource !== args.pricingSource) {
    return false
  }
  if (args.printingKey && series.printingKey !== args.printingKey) {
    return false
  }

  return true
}

function matchesResolutionIssueFilters(
  issue: {
    active: boolean
    setKey: string
    categoryKey: string
    issueType: string
    isIgnored?: boolean
  },
  args: {
    activeOnly?: boolean
    setKey?: string
    categoryKey?: string
    issueType?: string
    includeIgnored?: boolean
  },
) {
  if (args.activeOnly && !issue.active) {
    return false
  }
  if (args.setKey && issue.setKey !== args.setKey) {
    return false
  }
  if (args.categoryKey && issue.categoryKey !== args.categoryKey) {
    return false
  }
  if (args.issueType && issue.issueType !== args.issueType) {
    return false
  }

  return args.includeIgnored ? true : issue.isIgnored !== true
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
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const normalizedSearch = args.search?.trim()

    if (normalizedSearch) {
      return await ctx.db
        .query('pricingTrackedSeries')
        .withSearchIndex('search_searchText', (q) => {
          let searchQuery = q.search('searchText', normalizedSearch)
          if (args.activeOnly) {
            searchQuery = searchQuery.eq('active', true)
          }
          if (args.categoryKey) {
            searchQuery = searchQuery.eq('categoryKey', args.categoryKey)
          }
          if (args.setKey) {
            searchQuery = searchQuery.eq('setKey', args.setKey)
          }
          if (args.pricingSource) {
            searchQuery = searchQuery.eq('pricingSource', args.pricingSource)
          }
          if (args.printingKey) {
            searchQuery = searchQuery.eq('printingKey', args.printingKey)
          }
          return searchQuery
        })
        .paginate(args.paginationOpts)
    }

    return await paginateFilteredQuery({
      paginationOpts: args.paginationOpts,
      fetchPage: async (paginationOpts) => {
        if (args.activeOnly && args.pricingSource && !args.setKey && !args.categoryKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_active_pricingSource_updatedAt', (q) =>
              q.eq('active', true).eq('pricingSource', args.pricingSource!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.pricingSource && !args.setKey && !args.categoryKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_pricingSource_updatedAt', (q) =>
              q.eq('pricingSource', args.pricingSource!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly && args.printingKey && !args.setKey && !args.categoryKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_active_printingKey_updatedAt', (q) =>
              q.eq('active', true).eq('printingKey', args.printingKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.printingKey && !args.setKey && !args.categoryKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_printingKey_updatedAt', (q) =>
              q.eq('printingKey', args.printingKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly && args.setKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_active_setKey_updatedAt', (q) =>
              q.eq('active', true).eq('setKey', args.setKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly && args.categoryKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_active_categoryKey_updatedAt', (q) =>
              q.eq('active', true).eq('categoryKey', args.categoryKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_active_updatedAt', (q) => q.eq('active', true))
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.setKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_setKey_updatedAt', (q) =>
              q.eq('setKey', args.setKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.categoryKey) {
          return await ctx.db
            .query('pricingTrackedSeries')
            .withIndex('by_categoryKey_updatedAt', (q) =>
              q.eq('categoryKey', args.categoryKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        return await ctx.db
          .query('pricingTrackedSeries')
          .withIndex('by_updatedAt')
          .order('desc')
          .paginate(paginationOpts)
      },
      predicate: (series) => matchesTrackedSeriesFilters(series, args),
    })
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
    const normalizedSearch = search.trim().replace(/\s+/g, ' ')
    if (!normalizedSearch) {
      return []
    }

    const requestedLimit = clampLimit(limit, 20, 50)
    const normalizedSearchKey = normalizeCatalogProductSearch(normalizedSearch)

    const exactMatches = await ctx.db
      .query('catalogProducts')
      .withIndex('by_cleanName', (q) => q.eq('cleanName', normalizedSearch))
      .collect()

    const fuzzyMatches = await ctx.db
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
      .take(Math.min(Math.max(requestedLimit * 10, 100), 200))

    const filteredExactMatches = exactMatches.filter((product) => {
      if (categoryKey && product.categoryKey !== categoryKey) {
        return false
      }
      if (setKey && product.setKey !== setKey) {
        return false
      }
      return true
    })

    const mergedResults = new Map<string, (typeof fuzzyMatches)[number]>()
    for (const product of filteredExactMatches) {
      mergedResults.set(product.key, product)
    }
    for (const product of fuzzyMatches) {
      mergedResults.set(product.key, product)
    }

    return rankCatalogProductSearchResults(
      [...mergedResults.values()],
      normalizedSearchKey,
    ).slice(0, requestedLimit)
  },
})

export const getRelevantRulesForSet = internalQuery({
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
        set: null,
        setRules: [],
        categoryRules: [],
        manualRules: [],
      }
    }

    const [scopedRules, categoryRules] = await Promise.all([
      ctx.db
        .query('pricingTrackingRules')
        .withIndex('by_active_setKey', (q: any) =>
          q.eq('active', true).eq('setKey', set.key),
        )
        .collect(),
      ctx.db
        .query('pricingTrackingRules')
        .withIndex('by_active_categoryKey', (q: any) =>
          q.eq('active', true).eq('categoryKey', set.categoryKey),
        )
        .collect(),
    ])

    return {
      set,
      setRules: scopedRules.filter((rule) => rule.ruleType === 'set'),
      manualRules: scopedRules.filter((rule) => rule.ruleType === 'manual_product'),
      categoryRules: categoryRules.filter((rule) =>
        categoryRuleAppliesToSet(rule, set),
      ),
    }
  },
})

export const listCatalogProductsForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('catalogProducts')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .paginate(paginationOpts)
  },
})

export const listCatalogSkusForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('catalogSkus')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .paginate(paginationOpts)
  },
})

export const listTrackedSeriesForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('pricingTrackedSeries')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .paginate(paginationOpts)
  },
})

export const listActiveTrackedSeriesForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('pricingTrackedSeries')
      .withIndex('by_active_setKey', (q) =>
        q.eq('active', true).eq('setKey', setKey),
      )
      .paginate(paginationOpts)
  },
})

export const listTrackedSeriesRulesForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('pricingTrackedSeriesRules')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .paginate(paginationOpts)
  },
})

export const listResolutionIssuesForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('pricingResolutionIssues')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .paginate(paginationOpts)
  },
})

export const listResolutionIssues = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    setKey: v.optional(v.string()),
    categoryKey: v.optional(v.string()),
    issueType: v.optional(pricingResolutionIssueTypeValidator),
    includeIgnored: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.activeOnly && !args.includeIgnored && args.issueType && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_active_isIgnored_issueType_lastSeenAt', (q) =>
          q
            .eq('active', true)
            .eq('isIgnored', false)
            .eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (args.activeOnly && args.issueType && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_active_issueType_lastSeenAt', (q) =>
          q.eq('active', true).eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (!args.includeIgnored && args.issueType && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_isIgnored_issueType_lastSeenAt', (q) =>
          q.eq('isIgnored', false).eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (args.issueType && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_issueType_lastSeenAt', (q) =>
          q.eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (args.activeOnly && !args.includeIgnored && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_active_isIgnored_lastSeenAt', (q) =>
          q.eq('active', true).eq('isIgnored', false),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (!args.includeIgnored && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_isIgnored_lastSeenAt', (q) =>
          q.eq('isIgnored', false),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    return await paginateFilteredQuery({
      paginationOpts: args.paginationOpts,
      fetchPage: async (paginationOpts) => {
        if (args.activeOnly && args.setKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_setKey_lastSeenAt', (q) =>
              q.eq('active', true).eq('setKey', args.setKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly && args.categoryKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_categoryKey_lastSeenAt', (q) =>
              q.eq('active', true).eq('categoryKey', args.categoryKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_lastSeenAt', (q) => q.eq('active', true))
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.setKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_setKey_lastSeenAt', (q) =>
              q.eq('setKey', args.setKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.categoryKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_categoryKey_lastSeenAt', (q) =>
              q.eq('categoryKey', args.categoryKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        return await ctx.db
          .query('pricingResolutionIssues')
          .withIndex('by_lastSeenAt')
          .order('desc')
          .paginate(paginationOpts)
      },
      predicate: (issue) => matchesResolutionIssueFilters(issue, args),
    })
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
    const candidateSets = await ctx.db
      .query('catalogSets')
      .withIndex('by_hasActiveTrackedSeries_lastSyncedAt', (q: any) =>
        q.eq('hasActiveTrackedSeries', true),
      )
      .order('asc')
      .take(Math.max(maxResults * 8, 200))
    const staleSets: Array<{
      setKey: string
      lastSyncedAt?: number
      ageMs: number
    }> = []

    for (const set of candidateSets) {
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
        setKey: set.key,
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
