import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery } from '../../_generated/server'
import { query } from '../../lib/auth'
import { categoryRuleAppliesToSet, isSetInRuleScope } from '../ruleScope'
import { paginateFilteredQuery } from './pagination'

const pricingSourceFilterValidator = v.union(
  v.literal('sku'),
  v.literal('product_fallback'),
  v.literal('unavailable'),
)

function clampLimit(limit: number | undefined, fallback = 50, max = 200) {
  return Math.max(1, Math.min(limit ?? fallback, max))
}

function matchesTrackedSeriesFilters(
  series: {
    active: boolean
    categoryKey: string
    setKey: string
    pricingSource: string
    printingKey: string
  },
  args: {
    activeOnly?: boolean
    categoryKey?: string
    setKey?: string
    pricingSource?: string
    printingKey?: string
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
        if (
          args.activeOnly &&
          args.pricingSource &&
          !args.setKey &&
          !args.categoryKey
        ) {
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

        if (
          args.activeOnly &&
          args.printingKey &&
          !args.setKey &&
          !args.categoryKey
        ) {
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
      manualRules: scopedRules.filter(
        (rule) => rule.ruleType === 'manual_product',
      ),
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
