import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { refreshRuleDashboardFieldsForCategory } from '../../pricing/dashboardReadModel'

export const upsertCategoriesBatch = internalMutation({
  args: {
    categories: v.array(v.any()),
  },
  handler: async (ctx, { categories }) => {
    let inserted = 0
    let updated = 0
    const touchedCategoryKeys = new Set<string>()

    for (const category of categories) {
      touchedCategoryKeys.add(category.key)
      const existing = await ctx.db
        .query('catalogCategories')
        .withIndex('by_key', (q) => q.eq('key', category.key))
        .unique()

      if (existing) {
        await ctx.db.patch('catalogCategories', existing._id, {
          tcgtrackingCategoryId: category.tcgtrackingCategoryId,
          name: category.name,
          displayName: category.displayName,
          productCount: category.productCount,
          setCount: category.setCount,
          updatedAt: category.updatedAt,
        })
        updated += 1
      } else {
        await ctx.db.insert('catalogCategories', category)
        inserted += 1
      }
    }

    for (const categoryKey of touchedCategoryKeys) {
      await refreshRuleDashboardFieldsForCategory(ctx, categoryKey)
    }

    return {
      inserted,
      updated,
    }
  },
})
