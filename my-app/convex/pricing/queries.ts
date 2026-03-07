import { v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'

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
)

async function countDocuments(
  queryHandle: AsyncIterable<unknown>,
): Promise<number> {
  let count = 0

  for await (const _document of queryHandle) {
    count += 1
  }

  return count
}

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
    const rules = await ctx.db.query('pricingTrackingRules').collect()
    const activeSeriesCounts = new Map<string, number>()

    await Promise.all(
      rules.map(async (rule) => {
        const activeSeriesCount = await countDocuments(
          ctx.db
            .query('pricingTrackedSeriesRules')
            .withIndex('by_ruleId_active', (q) =>
              q.eq('ruleId', rule._id).eq('active', true),
            ),
        )

        activeSeriesCounts.set(rule._id, activeSeriesCount)
      }),
    )

    return rules
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((rule) => ({
        ...rule,
        activeSeriesCount: activeSeriesCounts.get(rule._id) ?? 0,
      }))
  },
})

export const getPricingStats = query({
  args: {},
  handler: async (ctx) => {
    const [
      totalTrackedSeries,
      totalActiveTrackedSeries,
      totalRules,
      totalActiveRules,
      totalIssues,
      totalActiveIssues,
    ] = await Promise.all([
      countDocuments(ctx.db.query('pricingTrackedSeries')),
      countDocuments(
        ctx.db
          .query('pricingTrackedSeries')
          .withIndex('by_active', (q) => q.eq('active', true)),
      ),
      countDocuments(ctx.db.query('pricingTrackingRules')),
      countDocuments(
        ctx.db
          .query('pricingTrackingRules')
          .withIndex('by_active', (q) => q.eq('active', true)),
      ),
      countDocuments(ctx.db.query('pricingResolutionIssues')),
      countDocuments(
        ctx.db
          .query('pricingResolutionIssues')
          .withIndex('by_active', (q) => q.eq('active', true)),
      ),
    ])

    return {
      totalTrackedSeries,
      totalActiveTrackedSeries,
      totalRules,
      totalActiveRules,
      totalIssues,
      totalActiveIssues,
    }
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

    const history = await ctx.db
      .query('pricingHistory')
      .withIndex('by_seriesKey_effectiveAt', (q) =>
        q.eq('seriesKey', seriesKey),
      )
      .collect()

    return history.filter((entry) =>
      cutoff ? entry.effectiveAt >= cutoff : true,
    )
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
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const issues = args.activeOnly
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

      if (set.syncStatus === 'syncing') {
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
