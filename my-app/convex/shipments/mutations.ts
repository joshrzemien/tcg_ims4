import { v } from 'convex/values'
import { internalMutation, mutation } from '../_generated/server'
import {
  deriveOrderShippingMethod,
  deriveShipmentShippingMethod,
} from '../../shared/shippingMethod'
import {
  deriveOrderShippingStatus,
  deriveShipmentShippingStatus,
  pickLatestShipment,
} from '../utils/shippingStatus'

async function syncOrderDerivedFields(ctx: { db: any }, orderId: any) {
  if (!orderId) return
  const order = await ctx.db.get('orders', orderId)
  if (!order) return

  const shipments = await ctx.db
    .query('shipments')
    .withIndex('by_orderId', (q: any) => q.eq('orderId', orderId))
    .collect()
  const latestShipment = pickLatestShipment<any>(shipments)

  await ctx.db.patch('orders', orderId, {
    shippingMethod: deriveOrderShippingMethod({ order, latestShipment }),
    shippingStatus: deriveOrderShippingStatus({ order, latestShipment }),
    updatedAt: Date.now(),
  })
}

export const upsertShipment = internalMutation({
  args: { shipment: v.any() },
  handler: async (ctx, { shipment }) => {
    const existing = await ctx.db
      .query('shipments')
      .withIndex('by_easypostShipmentId', (q) =>
        q.eq('easypostShipmentId', shipment.easypostShipmentId),
      )
      .unique()
    const nextShipment = existing ? { ...existing, ...shipment } : shipment
    const shippingMethod = deriveShipmentShippingMethod(nextShipment)
    const persistedShipment = {
      ...shipment,
      ...(shippingMethod && { shippingMethod }),
      status: deriveShipmentShippingStatus(nextShipment),
    }

    if (existing) {
      await ctx.db.patch('shipments', existing._id, persistedShipment)
      await syncOrderDerivedFields(ctx, shipment.orderId ?? existing.orderId)
    } else {
      await ctx.db.insert('shipments', persistedShipment)
      await syncOrderDerivedFields(ctx, shipment.orderId)
    }
  },
})

export const backfillDerivedStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const shipments = await ctx.db.query('shipments').collect()
    let updated = 0

    for (const shipment of shipments) {
      const nextStatus = deriveShipmentShippingStatus(shipment)
      if (shipment.status !== nextStatus) {
        await ctx.db.patch('shipments', shipment._id, {
          status: nextStatus,
          updatedAt: Date.now(),
        })
        updated += 1
      }

      if (shipment.orderId) {
        await syncOrderDerivedFields(ctx, shipment.orderId)
      }
    }

    return {
      scanned: shipments.length,
      updated,
    }
  },
})
