import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { refreshRuleDashboardFieldsForProductKeys } from '../../pricing/dashboardReadModel'

export const upsertProductsBatch = internalMutation({
  args: {
    products: v.array(v.any()),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { products, syncStartedAt }) => {
    let inserted = 0
    let updated = 0
    const touchedProductKeys = new Set<string>()

    for (const incoming of products) {
      touchedProductKeys.add(incoming.key)
      const existing = await ctx.db
        .query('catalogProducts')
        .withIndex('by_key', (q) => q.eq('key', incoming.key))
        .unique()

      const nextRecord = {
        ...incoming,
        lastIngestedAt: syncStartedAt,
        updatedAt: syncStartedAt,
      }

      if (existing) {
        await ctx.db.patch('catalogProducts', existing._id, nextRecord)
        updated += 1
      } else {
        await ctx.db.insert('catalogProducts', nextRecord)
        inserted += 1
      }
    }

    await refreshRuleDashboardFieldsForProductKeys(
      ctx,
      [...touchedProductKeys],
    )

    return {
      inserted,
      updated,
    }
  },
})
