import { v } from 'convex/values'
import { internalMutation, mutation } from '../_generated/server'
import { deriveShipmentShippingMethod } from '../../shared/shippingMethod'
import {
  deriveShipmentShippingStatus,
} from '../utils/shippingStatus'
import {
  buildOrderShipmentState,
  materializedOrderShipmentStateEquals,
} from '../orders/shipmentSummary'

async function syncOrderDerivedFields(ctx: { db: any }, orderId: any) {
  if (!orderId) return
  const order = await ctx.db.get('orders', orderId)
  if (!order) return

  const shipments = await ctx.db
    .query('shipments')
    .withIndex('by_orderId', (q: any) => q.eq('orderId', orderId))
    .collect()
  const shipmentState = buildOrderShipmentState({
    order,
    shipments,
  })

  if (materializedOrderShipmentStateEquals(order, shipmentState)) {
    return
  }

  await ctx.db.patch('orders', orderId, {
    ...shipmentState,
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
    const previousOrderId = existing?.orderId

    if (existing) {
      await ctx.db.patch('shipments', existing._id, persistedShipment)
    } else {
      await ctx.db.insert('shipments', persistedShipment)
    }

    const nextOrderId = shipment.orderId ?? existing?.orderId
    await syncOrderDerivedFields(ctx, nextOrderId)

    if (previousOrderId && previousOrderId !== nextOrderId) {
      await syncOrderDerivedFields(ctx, previousOrderId)
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
