import { v } from 'convex/values'
import { query } from '../_generated/server'

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('shipments').collect()
  },
})

export const getByOrderId = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, { orderId }) => {
    return await ctx.db
      .query('shipments')
      .withIndex('by_orderId', (q) => q.eq('orderId', orderId))
      .collect()
  },
})
