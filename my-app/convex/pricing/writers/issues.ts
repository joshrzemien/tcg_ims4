import { v } from 'convex/values'
import { internalMutation, mutation } from '../../_generated/server'
import { applyDashboardStatsDelta } from '../dashboardReadModel'
import {
  buildSyncIssueKey,
  isActiveUnignoredIssue,
} from '../shared/keys'

export const upsertSyncIssue = internalMutation({
  args: {
    setKey: v.string(),
    failedAt: v.number(),
    message: v.string(),
    syncStage: v.union(v.literal('catalog'), v.literal('pricing')),
  },
  handler: async (ctx, { setKey, failedAt, message, syncStage }) => {
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const key = buildSyncIssueKey(setKey)
    const existing = await ctx.db
      .query('pricingResolutionIssues')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()

    const details = {
      setName: set.name,
      message,
      syncStage,
      syncStatus: set.syncStatus,
      pricingSyncStatus: set.pricingSyncStatus,
    }

    if (existing) {
      const wasActiveUnignored = isActiveUnignoredIssue(existing)
      await ctx.db.patch('pricingResolutionIssues', existing._id, {
        details,
        lastSeenAt: failedAt,
        occurrenceCount: existing.occurrenceCount + 1,
        active: true,
      })

      if (!wasActiveUnignored && !existing.ignoredAt) {
        await applyDashboardStatsDelta(
          ctx,
          {
            totalActiveIssues: 1,
          },
          failedAt,
        )
      }

      return { key, updated: true }
    }

    await ctx.db.insert('pricingResolutionIssues', {
      key,
      catalogProductKey: '',
      seriesKey: '',
      setKey: set.key,
      categoryKey: set.categoryKey,
      issueType: 'sync_error',
      details,
      firstSeenAt: failedAt,
      lastSeenAt: failedAt,
      occurrenceCount: 1,
      active: true,
      isIgnored: false,
      ignoredAt: undefined,
    })
    await applyDashboardStatsDelta(
      ctx,
      {
        totalIssues: 1,
        totalActiveIssues: 1,
      },
      failedAt,
    )

    return { key, updated: false }
  },
})

export const resolveSyncIssue = internalMutation({
  args: {
    setKey: v.string(),
    resolvedAt: v.number(),
  },
  handler: async (ctx, { setKey, resolvedAt }) => {
    const key = buildSyncIssueKey(setKey)
    const existing = await ctx.db
      .query('pricingResolutionIssues')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()

    if (!existing || !existing.active) {
      return { key, resolved: false }
    }

    await ctx.db.patch('pricingResolutionIssues', existing._id, {
      active: false,
      lastSeenAt: resolvedAt,
    })
    if (isActiveUnignoredIssue(existing)) {
      await applyDashboardStatsDelta(
        ctx,
        {
          totalActiveIssues: -1,
        },
        resolvedAt,
      )
    }

    return { key, resolved: true }
  },
})

export const setIssueIgnored = mutation({
  args: {
    issueId: v.id('pricingResolutionIssues'),
    ignored: v.boolean(),
  },
  handler: async (ctx, { issueId, ignored }) => {
    const issue = await ctx.db.get('pricingResolutionIssues', issueId)
    if (!issue) {
      throw new Error(`Pricing issue not found: ${issueId}`)
    }

    const updatedAt = Date.now()
    await ctx.db.patch('pricingResolutionIssues', issueId, {
      isIgnored: ignored,
      ignoredAt: ignored ? updatedAt : undefined,
    })
    if (issue.active) {
      if (ignored && !issue.ignoredAt) {
        await applyDashboardStatsDelta(
          ctx,
          {
            totalActiveIssues: -1,
          },
          updatedAt,
        )
      } else if (!ignored && issue.ignoredAt) {
        await applyDashboardStatsDelta(
          ctx,
          {
            totalActiveIssues: 1,
          },
          updatedAt,
        )
      }
    }

    return {
      issueId,
      ignored,
    }
  },
})
