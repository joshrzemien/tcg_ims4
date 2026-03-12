import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'

export const upsertSkusBatch = internalMutation({
  args: {
    skus: v.array(v.any()),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { skus, syncStartedAt }) => {
    let inserted = 0
    let updated = 0

    for (const incoming of skus) {
      const existing = await ctx.db
        .query('catalogSkus')
        .withIndex('by_key', (q) => q.eq('key', incoming.key))
        .unique()

      const nextRecord = {
        ...incoming,
        lastIngestedAt: syncStartedAt,
        updatedAt: syncStartedAt,
      }

      if (existing) {
        await ctx.db.patch('catalogSkus', existing._id, nextRecord)
        updated += 1
      } else {
        await ctx.db.insert('catalogSkus', nextRecord)
        inserted += 1
      }
    }

    return {
      inserted,
      updated,
    }
  },
})
