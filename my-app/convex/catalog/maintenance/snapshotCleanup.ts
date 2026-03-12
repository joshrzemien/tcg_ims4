import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'

export const cleanupSetSnapshot = internalMutation({
  args: {
    setKey: v.string(),
    syncStartedAt: v.number(),
    productLimit: v.number(),
    skuLimit: v.number(),
  },
  handler: async (ctx, { setKey, syncStartedAt, productLimit, skuLimit }) => {
    const products = await ctx.db
      .query('catalogProducts')
      .withIndex('by_setKey_lastIngestedAt', (q) =>
        q.eq('setKey', setKey).lt('lastIngestedAt', syncStartedAt),
      )
      .take(productLimit)
    const skus = await ctx.db
      .query('catalogSkus')
      .withIndex('by_setKey_lastIngestedAt', (q) =>
        q.eq('setKey', setKey).lt('lastIngestedAt', syncStartedAt),
      )
      .take(skuLimit)

    let deletedProducts = 0
    let deletedSkus = 0

    for (const product of products) {
      await ctx.db.delete('catalogProducts', product._id)
      deletedProducts += 1
    }

    for (const sku of skus) {
      await ctx.db.delete('catalogSkus', sku._id)
      deletedSkus += 1
    }

    return {
      deletedProducts,
      deletedSkus,
      hasMoreProducts: products.length === productLimit,
      hasMoreSkus: skus.length === skuLimit,
    }
  },
})

export const purgeSetSnapshot = internalMutation({
  args: {
    setKey: v.string(),
    productLimit: v.number(),
    skuLimit: v.number(),
  },
  handler: async (ctx, { setKey, productLimit, skuLimit }) => {
    const products = await ctx.db
      .query('catalogProducts')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .take(productLimit)
    const skus = await ctx.db
      .query('catalogSkus')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .take(skuLimit)

    let deletedProducts = 0
    let deletedSkus = 0

    for (const product of products) {
      await ctx.db.delete('catalogProducts', product._id)
      deletedProducts += 1
    }

    for (const sku of skus) {
      await ctx.db.delete('catalogSkus', sku._id)
      deletedSkus += 1
    }

    return {
      deletedProducts,
      deletedSkus,
      hasMoreProducts: products.length === productLimit,
      hasMoreSkus: skus.length === skuLimit,
    }
  },
})
