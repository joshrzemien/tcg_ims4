import { v } from 'convex/values'
import { internalMutation, mutation } from '../_generated/server'
import {
  deriveOrderShippingMethod,
  deriveShipmentShippingMethod,
} from '../../shared/shippingMethod'
import {
  deriveOrderShippingStatus,
  normalizeShippingStatus,
  pickLatestShipment,
} from '../utils/shippingStatus'

async function latestShipmentForOrder(ctx: { db: any }, orderId: any) {
  const shipments = await ctx.db
    .query('shipments')
    .withIndex('by_orderId', (q: any) => q.eq('orderId', orderId))
    .collect()

  return pickLatestShipment<any>(shipments)
}

async function upsertSingleOrder(ctx: { db: any }, order: any) {
  const { status: _ignoredStatus, ...orderRecord } = order

  const existing = await ctx.db
    .query('orders')
    .withIndex('by_externalId', (q: any) =>
      q.eq('externalId', orderRecord.externalId),
    )
    .unique()

  if (existing) {
    const latestShipment = await latestShipmentForOrder(ctx, existing._id)
    const shippingMethod = deriveOrderShippingMethod({
      order: orderRecord,
      latestShipment,
    })
    const nextOrder = {
      ...orderRecord,
      shippingMethod,
      shippingStatus: deriveOrderShippingStatus({
        order: orderRecord,
        latestShipment,
      }),
    }

    // Sync jobs should not clear fulfillment if it was already set internally.
    if (typeof orderRecord.fulfillmentStatus !== 'boolean') {
      delete nextOrder.fulfillmentStatus
    }

    await ctx.db.patch('orders', existing._id, nextOrder)
  } else {
    const shippingMethod = deriveOrderShippingMethod({
      order: orderRecord,
    })
    const nextOrder = {
      ...orderRecord,
      shippingMethod,
      shippingStatus: deriveOrderShippingStatus({ order: orderRecord }),
      fulfillmentStatus:
        typeof orderRecord.fulfillmentStatus === 'boolean'
          ? orderRecord.fulfillmentStatus
          : false,
    }
    await ctx.db.insert('orders', nextOrder)
  }
}

export const upsertOrder = internalMutation({
  args: { order: v.any() },
  handler: async (ctx, { order }) => {
    await upsertSingleOrder(ctx, order)
  },
})

export const backfillShippingMethods = mutation({
  args: {},
  handler: async (ctx) => {
    const [orders, shipments] = await Promise.all([
      ctx.db.query('orders').collect(),
      ctx.db.query('shipments').collect(),
    ])
    const latestShipmentByOrderId = new Map<any, any>()
    let updatedShipments = 0

    for (const shipment of shipments) {
      const nextShippingMethod = deriveShipmentShippingMethod(shipment)
      if (nextShippingMethod && shipment.shippingMethod !== nextShippingMethod) {
        await ctx.db.patch('shipments', shipment._id, {
          shippingMethod: nextShippingMethod,
          updatedAt: Date.now(),
        })
        updatedShipments += 1
      }

      if (!shipment.orderId) continue
      const existingShipment = latestShipmentByOrderId.get(shipment.orderId)
      const latestShipment = pickLatestShipment(
        existingShipment ? [existingShipment, shipment] : [shipment],
      )
      if (latestShipment) {
        latestShipmentByOrderId.set(shipment.orderId, latestShipment)
      }
    }

    let updatedOrders = 0

    for (const order of orders) {
      const nextShippingMethod = deriveOrderShippingMethod({
        order,
        latestShipment: latestShipmentByOrderId.get(order._id),
      })
      if (order.shippingMethod === nextShippingMethod) {
        continue
      }

      await ctx.db.patch('orders', order._id, {
        shippingMethod: nextShippingMethod,
        updatedAt: Date.now(),
      })
      updatedOrders += 1
    }

    return {
      scannedOrders: orders.length,
      scannedShipments: shipments.length,
      updatedOrders,
      updatedShipments,
    }
  },
})

export const upsertOrdersBatch = internalMutation({
  args: { orders: v.array(v.any()) },
  handler: async (ctx, { orders }) => {
    for (const order of orders) {
      await upsertSingleOrder(ctx, order)
    }
  },
})

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
      fulfillmentStatus: fulfilled,
      shippingStatus: normalizeShippingStatus(order.shippingStatus),
      updatedAt: Date.now(),
    })
  },
})

export const backfillShippingStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query('orders').collect()
    const shipments = await ctx.db.query('shipments').collect()
    const latestShipmentByOrderId = new Map<any, any>()
    for (const shipment of shipments) {
      if (!shipment.orderId) continue
      const existingShipment = latestShipmentByOrderId.get(shipment.orderId)
      const latestShipment = pickLatestShipment(
        existingShipment ? [existingShipment, shipment] : [shipment],
      )
      if (latestShipment) {
        latestShipmentByOrderId.set(shipment.orderId, latestShipment)
      }
    }
    let updated = 0

    for (const order of orders) {
      const nextStatus = deriveOrderShippingStatus({
        order,
        latestShipment: latestShipmentByOrderId.get(order._id),
      })
      if (order.shippingStatus === nextStatus) {
        continue
      }

      await ctx.db.patch('orders', order._id, {
        shippingStatus: nextStatus,
        updatedAt: Date.now(),
      })
      updated += 1
    }

    return {
      scanned: orders.length,
      updated,
    }
  },
})
