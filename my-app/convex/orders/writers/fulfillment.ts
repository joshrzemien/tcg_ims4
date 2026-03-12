import { v } from 'convex/values'
import { mutation } from '../../lib/auth'
import { normalizeShippingStatus } from '../../utils/shippingStatus'

export const setFulfillmentStatus = mutation({
  args: {
    orderId: v.id('orders'),
    fulfilled: v.boolean(),
  },
  handler: async (ctx, { orderId, fulfilled }) => {
    const order = await ctx.db.get('orders', orderId)
    if (!order) {
      throw new Error(`Order ${orderId} not found`)
    }

    await ctx.db.patch('orders', orderId, {
      isFulfilled: fulfilled,
      shippingStatus: normalizeShippingStatus(order.shippingStatus),
      updatedAt: Date.now(),
    })
  },
})
