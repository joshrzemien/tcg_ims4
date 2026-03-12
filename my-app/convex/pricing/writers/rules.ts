import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { mutation } from '../../lib/auth'
import {
  applyDashboardStatsDelta,
  deleteRuleDashboardStats,
  refreshRuleDashboardFields,
  setRuleActiveSeriesCount,
} from '../dashboardReadModel'
import { buildDefaultRuleLabel } from '../shared/keys'

export const createManualProductRule = mutation({
  args: {
    catalogProductKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { catalogProductKey, label }) => {
    const product = await ctx.db
      .query('catalogProducts')
      .withIndex('by_key', (q) => q.eq('key', catalogProductKey))
      .unique()

    if (!product) {
      throw new Error(`Catalog product not found: ${catalogProductKey}`)
    }

    const now = Date.now()
    const ruleId = await ctx.db.insert('pricingTrackingRules', {
      ruleType: 'manual_product',
      label:
        label?.trim() ||
        buildDefaultRuleLabel({
          ruleType: 'manual_product',
          name: product.name,
        }),
      active: true,
      categoryKey: product.categoryKey,
      setKey: product.setKey,
      catalogProductKey,
      createdAt: now,
      updatedAt: now,
    })

    await refreshRuleDashboardFields(ctx, ruleId)
    await setRuleActiveSeriesCount(ctx, ruleId, 0, now)
    await applyDashboardStatsDelta(
      ctx,
      {
        totalRules: 1,
        totalActiveRules: 1,
      },
      now,
    )

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})

export const createSetRule = mutation({
  args: {
    setKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { setKey, label }) => {
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const now = Date.now()
    const ruleId = await ctx.db.insert('pricingTrackingRules', {
      ruleType: 'set',
      label:
        label?.trim() ||
        buildDefaultRuleLabel({ ruleType: 'set', name: set.name }),
      active: true,
      setKey,
      createdAt: now,
      updatedAt: now,
    })

    await refreshRuleDashboardFields(ctx, ruleId)
    await setRuleActiveSeriesCount(ctx, ruleId, 0, now)
    await applyDashboardStatsDelta(
      ctx,
      {
        totalRules: 1,
        totalActiveRules: 1,
      },
      now,
    )

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})

export const createCategoryRule = mutation({
  args: {
    categoryKey: v.string(),
    label: v.optional(v.string()),
    seedExistingSets: v.optional(v.boolean()),
    autoTrackFutureSets: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { categoryKey, label, seedExistingSets, autoTrackFutureSets },
  ) => {
    const category = await ctx.db
      .query('catalogCategories')
      .withIndex('by_key', (q) => q.eq('key', categoryKey))
      .unique()

    if (!category) {
      throw new Error(`Catalog category not found: ${categoryKey}`)
    }

    const now = Date.now()
    const ruleId = await ctx.db.insert('pricingTrackingRules', {
      ruleType: 'category',
      label:
        label?.trim() ||
        buildDefaultRuleLabel({
          ruleType: 'category',
          name: category.displayName,
        }),
      active: true,
      categoryKey,
      seedExistingSets: seedExistingSets ?? true,
      autoTrackFutureSets: autoTrackFutureSets ?? true,
      createdAt: now,
      updatedAt: now,
    })

    await refreshRuleDashboardFields(ctx, ruleId)
    await setRuleActiveSeriesCount(ctx, ruleId, 0, now)
    await applyDashboardStatsDelta(
      ctx,
      {
        totalRules: 1,
        totalActiveRules: 1,
      },
      now,
    )

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})

export const setRuleActive = mutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
    active: v.boolean(),
  },
  handler: async (ctx, { ruleId, active }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule) {
      throw new Error(`Pricing rule not found: ${ruleId}`)
    }

    if (rule.active === active) {
      return {
        ruleId,
        active,
        scheduled: false,
      }
    }

    const updatedAt = Date.now()
    await ctx.db.patch('pricingTrackingRules', ruleId, {
      active,
      updatedAt,
    })
    await applyDashboardStatsDelta(
      ctx,
      {
        totalActiveRules: active ? 1 : -1,
      },
      updatedAt,
    )

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      active,
      scheduled: true,
    }
  },
})

export const deleteRule = mutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
  },
  handler: async (ctx, { ruleId }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule) {
      throw new Error(`Pricing rule not found: ${ruleId}`)
    }

    await ctx.db.delete('pricingTrackingRules', ruleId)
    await deleteRuleDashboardStats(ctx, ruleId)
    await applyDashboardStatsDelta(ctx, {
      totalRules: -1,
      totalActiveRules: rule.active ? -1 : 0,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})
