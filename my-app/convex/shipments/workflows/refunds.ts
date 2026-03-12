import { v } from 'convex/values'
import { api, internal } from '../../_generated/api'
import { action } from '../../lib/auth'
import {
  getNonRefundableEasyPostLetterShipmentMessage,
  isNonRefundableEasyPostLetterShipment,
} from '../../../shared/shippingRefund'
import { requireEnv } from '../shared/addressValidation'
import { refundShipment as requestRefund } from '../sources/easypost'
import {
  formatEasyPostError,
  loadOrderContext,
  shipmentHasPurchasedLabel,
} from './shared'

export const refundLabel = action({
  args: {
    orderId: v.id('orders'),
    easypostShipmentId: v.string(),
  },
  handler: async (ctx, { orderId, easypostShipmentId }) => {
    try {
      const { shipments } = await loadOrderContext(ctx, orderId)
      const targetShipment =
        shipments.find(
          (shipment) => shipment.easypostShipmentId === easypostShipmentId,
        ) ?? null

      if (!targetShipment) {
        throw new Error(
          `Shipment ${easypostShipmentId} not found for this order.`,
        )
      }

      if (!shipmentHasPurchasedLabel(targetShipment)) {
        throw new Error('Only purchased labels can be refunded.')
      }

      if (isNonRefundableEasyPostLetterShipment(targetShipment)) {
        throw new Error(getNonRefundableEasyPostLetterShipmentMessage())
      }

      const refund = await requestRefund(
        requireEnv('EASYPOST_API_KEY'),
        easypostShipmentId,
      )

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
        shipment: {
          orderId,
          easypostShipmentId,
          refundStatus: refund.easypostRefundStatus,
          updatedAt: Date.now(),
        },
      })

      return refund
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})

export const refundStandaloneLabel = action({
  args: {
    shipmentId: v.id('shipments'),
  },
  handler: async (ctx, { shipmentId }) => {
    try {
      const shipment = await ctx.runQuery(api.shipments.queries.getById, {
        shipmentId,
      })

      if (!shipment) {
        throw new Error(`Shipment ${shipmentId} not found.`)
      }

      if (shipment.orderId) {
        throw new Error('This shipment is linked to an order.')
      }

      if (!shipmentHasPurchasedLabel(shipment)) {
        throw new Error('Only purchased labels can be refunded.')
      }

      if (isNonRefundableEasyPostLetterShipment(shipment)) {
        throw new Error(getNonRefundableEasyPostLetterShipmentMessage())
      }

      const refund = await requestRefund(
        requireEnv('EASYPOST_API_KEY'),
        shipment.easypostShipmentId,
      )

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
        shipment: {
          easypostShipmentId: shipment.easypostShipmentId,
          refundStatus: refund.easypostRefundStatus,
          updatedAt: Date.now(),
        },
      })

      return refund
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})
