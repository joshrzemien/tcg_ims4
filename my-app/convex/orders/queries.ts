import { v } from 'convex/values'
import { deriveOrderShippingMethod } from '../../shared/shippingMethod'
import {
  deriveOrderShippingStatus,
  pickLatestShipment,
} from '../utils/shippingStatus'
import { query } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import type { ShippingStatus } from '../../shared/shippingStatus'
import type { ShippingMethod } from '../../shared/shippingMethod'

type OrderListRow = Omit<Doc<'orders'>, 'shippingStatus' | 'shippingMethod'> & {
  shippingStatus: ShippingStatus
  shippingMethod: ShippingMethod
  trackingPublicUrl?: string
  latestShipment?: Pick<
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
  >
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<Array<OrderListRow>> => {
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

    return orders.map((order) => {
      const latestShipment = latestShipmentByOrderId.get(order._id)

      return {
        ...order,
        shippingMethod: deriveOrderShippingMethod({
          order,
          latestShipment,
        }),
        shippingStatus: deriveOrderShippingStatus({
          order,
          latestShipment,
        }),
        ...(typeof latestShipment?.trackerPublicUrl === 'string' &&
        latestShipment.trackerPublicUrl.trim() !== ''
          ? { trackingPublicUrl: latestShipment.trackerPublicUrl }
          : {}),
        ...(latestShipment
          ? {
              latestShipment: {
                _id: latestShipment._id,
                easypostShipmentId: latestShipment.easypostShipmentId,
                status: latestShipment.status,
                ...(latestShipment.trackingNumber
                  ? { trackingNumber: latestShipment.trackingNumber }
                  : {}),
                ...(latestShipment.labelUrl
                  ? { labelUrl: latestShipment.labelUrl }
                  : {}),
                ...(latestShipment.refundStatus
                  ? { refundStatus: latestShipment.refundStatus }
                  : {}),
                ...(latestShipment.trackingStatus
                  ? { trackingStatus: latestShipment.trackingStatus }
                  : {}),
                ...(latestShipment.carrier
                  ? { carrier: latestShipment.carrier }
                  : {}),
                ...(latestShipment.service
                  ? { service: latestShipment.service }
                  : {}),
                ...(typeof latestShipment.rateCents === 'number'
                  ? { rateCents: latestShipment.rateCents }
                  : {}),
                createdAt: latestShipment.createdAt,
                updatedAt: latestShipment.updatedAt,
              },
            }
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
