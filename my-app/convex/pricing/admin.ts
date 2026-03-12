import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalQuery } from '../_generated/server'
import { action } from '../lib/auth'
import { getZeroDashboardStats } from './dashboardReadModel'
import type { Id } from '../_generated/dataModel'

const REBUILD_PAGE_SIZE = 250

export const listTrackedSeriesPage = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query('pricingTrackedSeries').paginate(paginationOpts)
  },
})

export const listRulesPage = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query('pricingTrackingRules').paginate(paginationOpts)
  },
})

export const listIssuesPage = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db
      .query('pricingResolutionIssues')
      .paginate(paginationOpts)
  },
})

export const listActiveRuleJoinsPage = internalQuery({
  args: {
    ruleId: v.id('pricingTrackingRules'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { ruleId, paginationOpts }) => {
    return await ctx.db
      .query('pricingTrackedSeriesRules')
      .withIndex('by_ruleId_active', (q) =>
        q.eq('ruleId', ruleId).eq('active', true),
      )
      .paginate(paginationOpts)
  },
})

export const rebuildDashboardReadModels = action({
  args: {},
  handler: async (ctx) => {
    const stats = getZeroDashboardStats()
    const ruleIds: Array<Id<'pricingTrackingRules'>> = []

    let continueCursor: string | null = null
    let isDone = false
    while (!isDone) {
      const page: {
        page: Array<any>
        continueCursor: string | null
        isDone: boolean
      } = await ctx.runQuery(internal.pricing.admin.listTrackedSeriesPage, {
        paginationOpts: {
          cursor: continueCursor,
          numItems: REBUILD_PAGE_SIZE,
        },
      })

      for (const series of page.page) {
        stats.totalTrackedSeries += 1
        if (series.active) {
          stats.totalActiveTrackedSeries += 1
        }
      }

      continueCursor = page.continueCursor
      isDone = page.isDone
    }

    continueCursor = null
    isDone = false
    while (!isDone) {
      const page: {
        page: Array<any>
        continueCursor: string | null
        isDone: boolean
      } = await ctx.runQuery(internal.pricing.admin.listRulesPage, {
        paginationOpts: {
          cursor: continueCursor,
          numItems: REBUILD_PAGE_SIZE,
        },
      })

      for (const rule of page.page) {
        stats.totalRules += 1
        if (rule.active) {
          stats.totalActiveRules += 1
        }
        ruleIds.push(rule._id)
      }

      continueCursor = page.continueCursor
      isDone = page.isDone
    }

    continueCursor = null
    isDone = false
    while (!isDone) {
      const page: {
        page: Array<any>
        continueCursor: string | null
        isDone: boolean
      } = await ctx.runQuery(internal.pricing.admin.listIssuesPage, {
        paginationOpts: {
          cursor: continueCursor,
          numItems: REBUILD_PAGE_SIZE,
        },
      })

      for (const issue of page.page) {
        stats.totalIssues += 1
        if (issue.active && !issue.ignoredAt) {
          stats.totalActiveIssues += 1
        }
      }

      continueCursor = page.continueCursor
      isDone = page.isDone
    }

    const updatedAt = Date.now()
    await ctx.runMutation(
      internal.pricing.mutations.replaceDashboardStatsSnapshot,
      {
        stats,
        updatedAt,
      },
    )

    let rebuiltRules = 0
    for (const ruleId of ruleIds) {
      let activeSeriesCount = 0
      let joinsCursor: string | null = null
      let joinsDone = false

      while (!joinsDone) {
        const joinsPage: {
          page: Array<any>
          continueCursor: string | null
          isDone: boolean
        } = await ctx.runQuery(internal.pricing.admin.listActiveRuleJoinsPage, {
          ruleId,
          paginationOpts: {
            cursor: joinsCursor,
            numItems: REBUILD_PAGE_SIZE,
          },
        })

        activeSeriesCount += joinsPage.page.length
        joinsCursor = joinsPage.continueCursor
        joinsDone = joinsPage.isDone
      }

      await ctx.runMutation(
        internal.pricing.mutations.rebuildRuleDashboardEntry,
        {
          ruleId,
          activeSeriesCount,
        },
      )
      rebuiltRules += 1
    }

    return {
      pageSize: REBUILD_PAGE_SIZE,
      rebuiltRules,
      stats,
      updatedAt,
    }
  },
})
