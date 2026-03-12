import { v } from 'convex/values'
import { query } from '../_generated/server'
import {
  SHIPPING_STATUS_VALUES,
  normalizeShippingStatus,
} from '../utils/shippingStatus'
import type { Doc } from '../_generated/dataModel'

const RECENT_ORDER_WITHOUT_TRACKING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const TERMINAL_SHIPMENT_STATUSES = new Set([
  'delivered',
  'return_to_sender',
  'failure',
  'error',
  'cancelled',
])
const REFRESHABLE_SHIPMENT_STATUSES = SHIPPING_STATUS_VALUES.filter(
  (status) => !TERMINAL_SHIPMENT_STATUSES.has(status),
)

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

export const listRefreshCandidates = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const maxResults = Math.max(1, Math.min(limit ?? 100, 250))
    const candidatesById = new Map<
      Doc<'shipments'>['_id'],
      Doc<'shipments'>
    >()

    await Promise.all(
      REFRESHABLE_SHIPMENT_STATUSES.map(async (status) => {
        const shipments = await ctx.db
          .query('shipments')
          .withIndex('by_status_createdAt', (q) => q.eq('status', status))
          .order('desc')
          .take(maxResults)

        for (const shipment of shipments) {
          if (!shipment.orderId) continue
          candidatesById.set(shipment._id, shipment)
        }
      }),
    )

    return [...candidatesById.values()]
      .sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt
        }

        return right.updatedAt - left.updatedAt
      })
      .slice(0, maxResults)
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
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const recentOrderWithoutTrackingCutoff =
      Date.now() - RECENT_ORDER_WITHOUT_TRACKING_WINDOW_MS
    const maxResults = Math.max(1, Math.min(limit ?? 100, 250))
    const shipments = await ctx.db
      .query('shipments')
      .withIndex('by_orderId_status_createdAt', (q) =>
        q.eq('orderId', undefined).eq('status', 'purchased').gte(
          'createdAt',
          recentOrderWithoutTrackingCutoff,
        ),
      )
      .order('desc')
      .take(maxResults)

    const standaloneShipments = shipments.filter(
      (shipment) =>
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
