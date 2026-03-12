import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { mutation } from '../../lib/auth'
import {
  deriveOrderShippingMethod,
  deriveShipmentShippingMethod,
} from '../../../shared/shippingMethod'
import { shouldMarkOrderFulfilled } from '../mappers/shared'
import {
  buildOrderShipmentState,
  materializedOrderShipmentStateEquals,
} from '../shipmentSummary'
import {
  deriveOrderShippingStatus,
  normalizeShippingStatus,
  pickLatestShipment,
} from '../../utils/shippingStatus'
import {
  collectBatchCatalogLookupKeys,
  enrichOrderItemsWithCatalogLinks,
  loadCatalogLookupMaps,
  orderItemsNeedCatalogUpdate,
} from '../loaders/catalogLinks'
import { shipmentsForOrder } from '../writers/orderUpsert'
import type { Doc, Id } from '../../_generated/dataModel'

function buildLatestShipmentByOrderId(shipments: Array<Doc<'shipments'>>) {
  const latestShipmentByOrderId = new Map<Id<'orders'>, Doc<'shipments'>>()

  for (const shipment of shipments) {
    if (!shipment.orderId) {
      continue
    }

    const existingShipment = latestShipmentByOrderId.get(shipment.orderId)
    const latestShipment = pickLatestShipment(
      existingShipment ? [existingShipment, shipment] : [shipment],
    )
    if (latestShipment) {
      latestShipmentByOrderId.set(shipment.orderId, latestShipment)
    }
  }

  return latestShipmentByOrderId
}

export const backfillShippingMethods = mutation({
  args: {},
  handler: async (ctx) => {
    const [orders, shipments] = await Promise.all([
      ctx.db.query('orders').collect(),
      ctx.db.query('shipments').collect(),
    ])
    const latestShipmentByOrderId = buildLatestShipmentByOrderId(shipments)
    let updatedShipments = 0

    for (const shipment of shipments) {
      const nextShippingMethod = deriveShipmentShippingMethod(shipment)
      if (
        nextShippingMethod &&
        shipment.shippingMethod !== nextShippingMethod
      ) {
        await ctx.db.patch('shipments', shipment._id, {
          shippingMethod: nextShippingMethod,
          updatedAt: Date.now(),
        })
        updatedShipments += 1
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

export const backfillCatalogLinks = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, { cursor, limit }) => {
    const page = await ctx.db.query('orders').paginate({
      cursor,
      numItems: Math.max(1, Math.min(limit, 100)),
    })
    const lookupMaps = await loadCatalogLookupMaps(
      ctx,
      collectBatchCatalogLookupKeys(page.page),
    )
    let updated = 0

    for (const order of page.page) {
      const nextItems = enrichOrderItemsWithCatalogLinks(
        order.items,
        lookupMaps,
      )
      if (!orderItemsNeedCatalogUpdate(order.items, nextItems)) {
        continue
      }

      await ctx.db.patch('orders', order._id, {
        items: nextItems,
        updatedAt: Date.now(),
      })
      updated += 1
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      updated,
    }
  },
})

export const backfillShipmentSummaries = mutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, { cursor, limit }) => {
    const page = await ctx.db.query('orders').paginate({
      cursor,
      numItems: Math.max(1, Math.min(limit, 100)),
    })
    let updated = 0

    for (const order of page.page) {
      const orderShipments = await shipmentsForOrder(ctx, order._id)
      const shipmentState = buildOrderShipmentState({
        order,
        shipments: orderShipments,
      })

      if (materializedOrderShipmentStateEquals(order, shipmentState)) {
        continue
      }

      await ctx.db.patch('orders', order._id, {
        ...shipmentState,
        updatedAt: Date.now(),
      })
      updated += 1
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scanned: page.page.length,
      updated,
    }
  },
})

export const backfillShippingStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query('orders').collect()
    const shipments = await ctx.db.query('shipments').collect()
    const latestShipmentByOrderId = buildLatestShipmentByOrderId(shipments)
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

export const backfillFulfillmentStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const [orders, shipments] = await Promise.all([
      ctx.db.query('orders').collect(),
      ctx.db.query('shipments').collect(),
    ])
    const latestShipmentByOrderId = buildLatestShipmentByOrderId(shipments)
    let updated = 0

    for (const order of orders) {
      const derivedShippingStatus = deriveOrderShippingStatus({
        order,
        latestShipment: latestShipmentByOrderId.get(order._id),
      })
      const nextIsFulfilled =
        order.channel === 'tcgplayer' || order.channel === 'manapool'
          ? shouldMarkOrderFulfilled(derivedShippingStatus)
          : order.isFulfilled

      if (order.isFulfilled === nextIsFulfilled) {
        continue
      }

      await ctx.db.patch('orders', order._id, {
        isFulfilled: nextIsFulfilled,
        shippingStatus: normalizeShippingStatus(derivedShippingStatus),
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
