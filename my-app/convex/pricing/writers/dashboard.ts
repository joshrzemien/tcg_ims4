import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import {
  applyDashboardStatsDelta,
  deleteRuleDashboardStats,
  refreshRuleDashboardFields,
  replaceDashboardStats,
  setRuleActiveSeriesCount,
} from '../dashboardReadModel'

export const applyTrackedSeriesCoverageBatch = internalMutation({
  args: {
    inserts: v.array(v.any()),
    patches: v.array(v.any()),
  },
  handler: async (ctx, { inserts, patches }) => {
    for (const insert of inserts) {
      await ctx.db.insert('pricingTrackedSeries', insert)
    }

    for (const patch of patches) {
      await ctx.db.patch('pricingTrackedSeries', patch.id, patch.value)
    }
  },
})

export const applyTrackedSeriesRuleCoverageBatch = internalMutation({
  args: {
    inserts: v.array(v.any()),
    patches: v.array(v.any()),
  },
  handler: async (ctx, { inserts, patches }) => {
    for (const insert of inserts) {
      await ctx.db.insert('pricingTrackedSeriesRules', insert)
    }

    for (const patch of patches) {
      await ctx.db.patch('pricingTrackedSeriesRules', patch.id, patch.value)
    }
  },
})

export const applyRuleActiveSeriesCountsBatch = internalMutation({
  args: {
    counts: v.array(v.any()),
    updatedAt: v.number(),
  },
  handler: async (ctx, { counts, updatedAt }) => {
    for (const count of counts) {
      await setRuleActiveSeriesCount(
        ctx,
        count.ruleId,
        count.activeSeriesCount,
        updatedAt,
      )
    }
  },
})

export const applyDashboardStatsDeltaMutation = internalMutation({
  args: {
    delta: v.any(),
    updatedAt: v.number(),
  },
  handler: async (ctx, { delta, updatedAt }) => {
    await applyDashboardStatsDelta(ctx, delta, updatedAt)
  },
})

export const applySeriesSnapshotBatch = internalMutation({
  args: {
    historyInserts: v.array(v.any()),
    seriesPatches: v.array(v.any()),
    issueInserts: v.array(v.any()),
    issuePatches: v.array(v.any()),
  },
  handler: async (ctx, { historyInserts, seriesPatches, issueInserts, issuePatches }) => {
    for (const insert of historyInserts) {
      await ctx.db.insert('pricingHistory', insert)
    }

    for (const patch of seriesPatches) {
      await ctx.db.patch('pricingTrackedSeries', patch.id, patch.value)
    }

    for (const insert of issueInserts) {
      await ctx.db.insert('pricingResolutionIssues', insert)
    }

    for (const patch of issuePatches) {
      await ctx.db.patch('pricingResolutionIssues', patch.id, patch.value)
    }
  },
})

export const deactivateResolutionIssuesBatch = internalMutation({
  args: {
    issuePatches: v.array(v.any()),
  },
  handler: async (ctx, { issuePatches }) => {
    for (const patch of issuePatches) {
      await ctx.db.patch('pricingResolutionIssues', patch.id, patch.value)
    }
  },
})

export const replaceDashboardStatsSnapshot = internalMutation({
  args: {
    stats: v.object({
      totalTrackedSeries: v.number(),
      totalActiveTrackedSeries: v.number(),
      totalRules: v.number(),
      totalActiveRules: v.number(),
      totalIssues: v.number(),
      totalActiveIssues: v.number(),
    }),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { stats, updatedAt }) => {
    await replaceDashboardStats(ctx, stats, updatedAt ?? Date.now())

    return {
      replaced: true,
    }
  },
})

export const rebuildRuleDashboardEntry = internalMutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
    activeSeriesCount: v.number(),
  },
  handler: async (ctx, { ruleId, activeSeriesCount }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule) {
      await deleteRuleDashboardStats(ctx, ruleId)
      return {
        ruleId,
        found: false,
      }
    }

    await setRuleActiveSeriesCount(ctx, ruleId, activeSeriesCount)
    await refreshRuleDashboardFields(ctx, ruleId)

    return {
      ruleId,
      found: true,
      activeSeriesCount,
    }
  },
})
