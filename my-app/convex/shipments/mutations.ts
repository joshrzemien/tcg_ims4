import { v } from 'convex/values'
import { internalMutation, mutation } from '../_generated/server'
import {
  deriveShipmentShippingMethod,
  normalizeShippingMethod,
} from '../../shared/shippingMethod'
import { deriveShipmentShippingStatus } from '../utils/shippingStatus'
import {
  buildOrderShipmentState,
  materializedOrderShipmentStateEquals,
} from '../orders/shipmentSummary'

function normalizeRefundStatus(value: unknown) {
  switch (value) {
    case 'submitted':
    case 'refunded':
    case 'rejected':
    case 'not_applicable':
    case 'unknown':
      return value
    default:
      return undefined
  }
}

function normalizeAddressSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const address = value as Record<string, unknown>
  return {
    ...(typeof address.id === 'string' ? { id: address.id } : {}),
    ...(typeof address.name === 'string' ? { name: address.name } : {}),
    ...(typeof address.company === 'string'
      ? { company: address.company }
      : {}),
    ...(typeof address.street1 === 'string'
      ? { street1: address.street1 }
      : {}),
    ...(typeof address.street2 === 'string'
      ? { street2: address.street2 }
      : {}),
    ...(typeof address.city === 'string' ? { city: address.city } : {}),
    ...(typeof address.state === 'string' ? { state: address.state } : {}),
    ...(typeof address.zip === 'string' ? { zip: address.zip } : {}),
    ...(typeof address.country === 'string'
      ? { country: address.country }
      : {}),
    ...(typeof address.phone === 'string' ? { phone: address.phone } : {}),
    ...(typeof address.email === 'string' ? { email: address.email } : {}),
    ...(typeof address.residential === 'boolean' ||
    typeof address.residential === 'string'
      ? { residential: address.residential }
      : {}),
  }
}

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
    const shippingMethod =
      deriveShipmentShippingMethod(nextShipment) ??
      normalizeShippingMethod(nextShipment.shippingMethod) ??
      undefined
    const refundStatus = normalizeRefundStatus(nextShipment.refundStatus)
    const toAddress = normalizeAddressSnapshot(nextShipment.toAddress)
    const {
      shippingMethod: _ignoredShippingMethod,
      refundStatus: _ignoredRefundStatus,
      toAddress: _ignoredToAddress,
      ...shipmentFields
    } = shipment
    const persistedShipment = {
      ...shipmentFields,
      ...(toAddress ? { toAddress } : { toAddress: undefined }),
      ...(shippingMethod ? { shippingMethod } : { shippingMethod: undefined }),
      refundStatus,
      status: deriveShipmentShippingStatus(nextShipment),
    }
    const previousOrderId = existing?.orderId

    let shipmentId = existing?._id
    if (existing) {
      await ctx.db.patch('shipments', existing._id, persistedShipment)
    } else {
      shipmentId = await ctx.db.insert('shipments', persistedShipment)
    }

    const nextOrderId = shipment.orderId ?? existing?.orderId
    await syncOrderDerivedFields(ctx, nextOrderId)

    if (previousOrderId && previousOrderId !== nextOrderId) {
      await syncOrderDerivedFields(ctx, previousOrderId)
    }

    return shipmentId
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
