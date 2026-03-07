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
import {
  buildOrderShipmentState,
  materializedOrderShipmentStateEquals,
} from './shipmentSummary'
import { shouldMarkOrderFulfilled } from './mappers/shared'

async function shipmentsForOrder(ctx: { db: any }, orderId: any) {
  return await ctx.db
    .query('shipments')
    .withIndex('by_orderId', (q: any) => q.eq('orderId', orderId))
    .collect()
}

function normalizeProductId(productId: string | undefined): number | undefined {
  if (typeof productId !== 'string' || productId.trim() === '') {
    return undefined
  }

  const numericValue = Number(productId)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

async function enrichOrderItemsWithCatalogLinks(
  ctx: { db: any },
  items: Array<any>,
) {
  const skuMap = new Map<number, any>()
  const productMap = new Map<number, any>()

  const distinctSkus = [...new Set(
    items
      .map((item) =>
        typeof item.tcgplayerSku === 'number' ? item.tcgplayerSku : undefined,
      )
      .filter((value): value is number => typeof value === 'number'),
  )]
  const distinctProductIds = [...new Set(
    items
      .map((item) => normalizeProductId(item.productId))
      .filter((value): value is number => typeof value === 'number'),
  )]

  for (const tcgplayerSku of distinctSkus) {
    const catalogSku = await ctx.db
      .query('catalogSkus')
      .withIndex('by_tcgplayerSku', (q: any) => q.eq('tcgplayerSku', tcgplayerSku))
      .unique()

    if (catalogSku) {
      skuMap.set(tcgplayerSku, catalogSku)
    }
  }

  for (const tcgplayerProductId of distinctProductIds) {
    const catalogProduct = await ctx.db
      .query('catalogProducts')
      .withIndex('by_tcgplayerProductId', (q: any) =>
        q.eq('tcgplayerProductId', tcgplayerProductId),
      )
      .unique()

    if (catalogProduct) {
      productMap.set(tcgplayerProductId, catalogProduct)
    }
  }

  return items.map((item) => {
    const productId = normalizeProductId(item.productId)
    const catalogSku =
      typeof item.tcgplayerSku === 'number'
        ? skuMap.get(item.tcgplayerSku)
        : undefined
    const catalogProduct =
      typeof productId === 'number' ? productMap.get(productId) : undefined

    return {
      ...item,
      ...(catalogSku?.catalogProductKey
        ? { catalogProductKey: catalogSku.catalogProductKey }
        : catalogProduct?.key
          ? { catalogProductKey: catalogProduct.key }
          : {}),
      ...(catalogSku?.key ? { catalogSkuKey: catalogSku.key } : {}),
    }
  })
}

function orderItemsNeedCatalogUpdate(currentItems: Array<any>, nextItems: Array<any>) {
  if (currentItems.length !== nextItems.length) {
    return true
  }

  return currentItems.some((item, index) => {
    const nextItem = nextItems[index]
    return (
      item.catalogProductKey !== nextItem.catalogProductKey ||
      item.catalogSkuKey !== nextItem.catalogSkuKey
    )
  })
}

async function upsertSingleOrder(ctx: { db: any }, order: any) {
  const { status: _ignoredStatus, ...orderRecord } = order
  const enrichedItems = await enrichOrderItemsWithCatalogLinks(ctx, orderRecord.items)

  const existing = await ctx.db
    .query('orders')
    .withIndex('by_externalId', (q: any) =>
      q.eq('externalId', orderRecord.externalId),
    )
    .unique()

  if (existing) {
    const orderShipments = await shipmentsForOrder(ctx, existing._id)
    const shipmentState = buildOrderShipmentState({
      order: orderRecord,
      shipments: orderShipments,
    })
    const nextFulfillmentStatus =
      typeof orderRecord.fulfillmentStatus === 'boolean'
        ? orderRecord.fulfillmentStatus
        : existing.fulfillmentStatus ?? false
    const nextOrder = {
      ...orderRecord,
      items: enrichedItems,
      ...shipmentState,
      fulfillmentStatus: nextFulfillmentStatus,
    }

    await ctx.db.patch('orders', existing._id, nextOrder)
  } else {
    const shipmentState = buildOrderShipmentState({
      order: orderRecord,
      shipments: [],
    })
    const nextOrder = {
      ...orderRecord,
      items: enrichedItems,
      ...shipmentState,
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
    let updated = 0

    for (const order of page.page) {
      const nextItems = await enrichOrderItemsWithCatalogLinks(ctx, order.items)
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

export const upsertOrdersBatch = internalMutation({
  args: { orders: v.array(v.any()) },
  handler: async (ctx, { orders }) => {
    for (const order of orders) {
      await upsertSingleOrder(ctx, order)
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

export const backfillFulfillmentStatuses = mutation({
  args: {},
  handler: async (ctx) => {
    const [orders, shipments] = await Promise.all([
      ctx.db.query('orders').collect(),
      ctx.db.query('shipments').collect(),
    ])
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
      const derivedShippingStatus = deriveOrderShippingStatus({
        order,
        latestShipment: latestShipmentByOrderId.get(order._id),
      })
      const nextFulfillmentStatus =
        order.channel === 'tcgplayer' || order.channel === 'manapool'
          ? shouldMarkOrderFulfilled(derivedShippingStatus)
          : order.fulfillmentStatus ?? false
      if (order.fulfillmentStatus === nextFulfillmentStatus) {
        continue
      }

      await ctx.db.patch('orders', order._id, {
        fulfillmentStatus: nextFulfillmentStatus,
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
