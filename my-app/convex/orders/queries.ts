import { v } from 'convex/values'
import { deriveOrderShippingMethod } from '../../shared/shippingMethod'
import {
  deriveOrderShippingStatus,
  hasRefundedPostage,
  normalizeShippingStatus,
  pickLatestShipment,
} from '../utils/shippingStatus'
import { query } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import type { ShippingStatus } from '../../shared/shippingStatus'
import type { ShippingMethod } from '../../shared/shippingMethod'

type ShipmentSummary = Pick<
  Doc<'shipments'>,
  | '_id'
  | 'easypostShipmentId'
  | 'status'
  | 'trackingNumber'
  | 'labelUrl'
  | 'refundStatus'
  | 'trackingStatus'
  | 'carrier'
  | 'service'
  | 'rateCents'
  | 'createdAt'
  | 'updatedAt'
  | 'trackerPublicUrl'
>

type OrderListRow = Omit<Doc<'orders'>, 'shippingStatus' | 'shippingMethod'> & {
  shippingStatus: ShippingStatus
  shippingMethod: ShippingMethod
  trackingPublicUrl?: string
  shipmentCount: number
  reviewShipmentCount: number
  activeShipment?: ShipmentSummary
  latestShipment?: ShipmentSummary
}

function shipmentHasPurchasedLabel(
  shipment: Pick<
    Doc<'shipments'>,
    'trackingNumber' | 'labelUrl' | 'easypostTrackerId'
  >,
) {
  return Boolean(
    shipment.trackingNumber || shipment.labelUrl || shipment.easypostTrackerId,
  )
}

function selectActiveShipment(
  shipments: Array<Doc<'shipments'>>,
): Doc<'shipments'> | undefined {
  const purchased = shipments.filter(
    (shipment) =>
      shipmentHasPurchasedLabel(shipment) &&
      !hasRefundedPostage(shipment.refundStatus),
  )
  if (purchased.length > 0) {
    return pickLatestShipment(purchased) ?? undefined
  }

  return pickLatestShipment(shipments) ?? undefined
}

function mapShipmentSummary(shipment: Doc<'shipments'>): ShipmentSummary {
  return {
    _id: shipment._id,
    easypostShipmentId: shipment.easypostShipmentId,
    status: shipment.status,
    ...(shipment.trackingNumber ? { trackingNumber: shipment.trackingNumber } : {}),
    ...(shipment.labelUrl ? { labelUrl: shipment.labelUrl } : {}),
    ...(shipment.refundStatus ? { refundStatus: shipment.refundStatus } : {}),
    ...(shipment.trackingStatus ? { trackingStatus: shipment.trackingStatus } : {}),
    ...(shipment.carrier ? { carrier: shipment.carrier } : {}),
    ...(shipment.service ? { service: shipment.service } : {}),
    ...(typeof shipment.rateCents === 'number'
      ? { rateCents: shipment.rateCents }
      : {}),
    ...(shipment.trackerPublicUrl
      ? { trackerPublicUrl: shipment.trackerPublicUrl }
      : {}),
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  }
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<Array<OrderListRow>> => {
    const [orders, shipments] = await Promise.all([
      ctx.db.query('orders').collect(),
      ctx.db.query('shipments').collect(),
    ])
    const shipmentsByOrderId = new Map<any, Array<Doc<'shipments'>>>()

    for (const shipment of shipments) {
      if (!shipment.orderId) continue
      const existingShipments = shipmentsByOrderId.get(shipment.orderId) ?? []
      existingShipments.push(shipment)
      shipmentsByOrderId.set(shipment.orderId, existingShipments)
    }

    return orders.map((order) => {
      const orderShipments = shipmentsByOrderId.get(order._id) ?? []
      const latestShipment = pickLatestShipment(orderShipments) ?? undefined
      const activeShipment = selectActiveShipment(orderShipments)
      const reviewShipmentCount = orderShipments.filter((shipment) => {
        if (!shipmentHasPurchasedLabel(shipment)) return false
        if (hasRefundedPostage(shipment.refundStatus)) return false
        if (normalizeShippingStatus(shipment.trackingStatus) !== 'unknown') {
          return false
        }
        return shipment._id !== activeShipment?._id
      }).length

      return {
        ...order,
        shippingMethod: deriveOrderShippingMethod({
          order,
          latestShipment: activeShipment ?? latestShipment,
        }),
        shippingStatus: deriveOrderShippingStatus({
          order,
          latestShipment: activeShipment ?? latestShipment,
        }),
        shipmentCount: orderShipments.length,
        reviewShipmentCount,
        ...(typeof activeShipment?.trackerPublicUrl === 'string' &&
        activeShipment.trackerPublicUrl.trim() !== ''
          ? { trackingPublicUrl: activeShipment.trackerPublicUrl }
          : {}),
        ...(activeShipment ? { activeShipment: mapShipmentSummary(activeShipment) } : {}),
        ...(latestShipment
          ? { latestShipment: mapShipmentSummary(latestShipment) }
          : {}),
      }
    })
  },
})

export const getById = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, { orderId }) => {
    return await ctx.db.get('orders', orderId)
  },
})
