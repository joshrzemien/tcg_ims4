import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import {
  applyDashboardStatsDelta,
  refreshRuleDashboardFields,
  setRuleActiveSeriesCount,
} from '../dashboardReadModel'
import { categoryRuleAppliesToSet, isSetInRuleScope } from '../ruleScope'
import { buildDefaultRuleLabel } from '../shared/keys'
import type { ConvexMutationCtx } from '../../lib/ctx'

export async function ensureSetRuleTrackedForImport(
  ctx: ConvexMutationCtx,
  setKey: string,
) {
  const set = await ctx.db
    .query('catalogSets')
    .withIndex('by_key', (q) => q.eq('key', setKey))
    .unique()

  if (!set) {
    throw new Error(`Catalog set not found: ${setKey}`)
  }

  if (await isSetInRuleScope(ctx, set)) {
    return {
      action: 'noop' as const,
      ruleId: null,
      scheduled: false,
      setKey,
    }
  }

  const existingSetRules = await ctx.db
    .query('pricingTrackingRules')
    .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
    .collect()

  const reusableRule = [...existingSetRules]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .find((rule) => rule.ruleType === 'set')

  if (reusableRule) {
    if (reusableRule.active) {
      return {
        action: 'noop' as const,
        ruleId: reusableRule._id,
        scheduled: false,
        setKey,
      }
    }

    const updatedAt = Date.now()
    await ctx.db.patch('pricingTrackingRules', reusableRule._id, {
      active: true,
      updatedAt,
    })
    await applyDashboardStatsDelta(
      ctx,
      {
        totalActiveRules: 1,
      },
      updatedAt,
    )

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId: reusableRule._id,
      },
    )

    return {
      action: 'reactivated' as const,
      ruleId: reusableRule._id,
      scheduled: true,
      setKey,
    }
  }

  const now = Date.now()
  const ruleId = await ctx.db.insert('pricingTrackingRules', {
    ruleType: 'set',
    label: buildDefaultRuleLabel({ ruleType: 'set', name: set.name }),
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
    action: 'created' as const,
    ruleId,
    scheduled: true,
    setKey,
  }
}

export const enqueueRuleAffectedSetSyncs = internalMutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
  },
  handler: async (ctx, { ruleId }) => {
    const [rule, existingJoins] = await Promise.all([
      ctx.db.get('pricingTrackingRules', ruleId),
      ctx.db
        .query('pricingTrackedSeriesRules')
        .withIndex('by_ruleId', (q: any) => q.eq('ruleId', ruleId))
        .collect(),
    ])

    const setKeys = new Set(existingJoins.map((join) => join.setKey))

    if (rule?.active) {
      if (rule.ruleType === 'manual_product') {
        if (rule.setKey) {
          setKeys.add(rule.setKey)
        } else if (rule.catalogProductKey) {
          const product = await ctx.db
            .query('catalogProducts')
            .withIndex('by_key', (q: any) =>
              q.eq('key', rule.catalogProductKey!),
            )
            .unique()

          if (product) {
            setKeys.add(product.setKey)
          }
        }
      } else if (rule.ruleType === 'set' && rule.setKey) {
        setKeys.add(rule.setKey)
      } else if (rule.ruleType === 'category' && rule.categoryKey) {
        const sets = await ctx.db
          .query('catalogSets')
          .withIndex('by_categoryKey', (q: any) =>
            q.eq('categoryKey', rule.categoryKey!),
          )
          .collect()

        for (const set of sets) {
          if (categoryRuleAppliesToSet(rule, set)) {
            setKeys.add(set.key)
          }
        }
      }
    }

    for (const setKey of setKeys) {
      await ctx.scheduler.runAfter(0, internal.catalog.sync.requestSetSync, {
        setKey,
        mode: 'pricing_only',
        reason: 'pricing_rule_change',
      })
    }

    return { scheduled: setKeys.size }
  },
})
