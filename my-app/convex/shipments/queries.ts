import { v } from 'convex/values'
import { query } from '../_generated/server'
import { normalizeShippingStatus } from '../utils/shippingStatus'

const RECENT_ORDER_WITHOUT_TRACKING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function isRecentPurchasedShipmentWithoutTrackingUpdate(
  shipment: {
    status?: string
    trackingStatus?: string
    createdAt?: number
  },
  cutoff: number,
) {
  return (
    shipment.status === 'purchased' &&
    normalizeShippingStatus(shipment.trackingStatus) === 'unknown' &&
    typeof shipment.createdAt === 'number' &&
    shipment.createdAt >= cutoff
  )
}

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

export const listStandalone = query({
  args: {},
  handler: async (ctx) => {
    const shipments = await ctx.db.query('shipments').collect()
    const recentOrderWithoutTrackingCutoff =
      Date.now() - RECENT_ORDER_WITHOUT_TRACKING_WINDOW_MS

    const standaloneShipments = shipments.filter(
      (shipment) =>
        shipment.orderId == null &&
        isRecentPurchasedShipmentWithoutTrackingUpdate(
          shipment,
          recentOrderWithoutTrackingCutoff,
        ),
    )

    return standaloneShipments
      .map((shipment) => {
        return {
          ...shipment,
          source: 'standalone' as const,
        }
      })
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt
        }

        return right.updatedAt - left.updatedAt
      })
  },
})

export const getById = query({
  args: { shipmentId: v.id('shipments') },
  handler: async (ctx, { shipmentId }) => {
    return await ctx.db.get('shipments', shipmentId)
  },
})
