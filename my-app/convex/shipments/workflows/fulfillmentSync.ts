import { v } from 'convex/values'
import { api } from '../../_generated/api'
import { action } from '../../_generated/server'
import { shouldMarkOrderFulfilled } from '../../orders/mappers/shared'
import { updateManapoolOrderFulfillment } from '../../orders/sources/manapool'
import { markTcgplayerOrderShipped } from '../../orders/sources/tcgplayer'
import {
  
  
  findBlockingShipment,
  formatGenericError,
  loadOrderContext
} from './shared'
import type {OrderDoc, ShipmentDoc} from './shared';

export async function syncMarketplaceFulfillmentForOrder(
  order: OrderDoc,
  shipments: Array<ShipmentDoc>,
  fulfilled: boolean,
): Promise<string | undefined> {
  if (!fulfilled) {
    return undefined
  }

  if (shouldMarkOrderFulfilled(order.shippingStatus)) {
    const marketplaceName = order.channel === 'manapool' ? 'ManaPool' : 'TCGPlayer'
    return `Warning: ${order.orderNumber} marked fulfilled locally, but ${marketplaceName} fulfillment sync was skipped because the order is already marked fulfilled on ${marketplaceName}.`
  }

  if (order.channel === 'tcgplayer') {
    if (order.shippingMethod === 'Parcel') {
      return `Warning: ${order.orderNumber} marked fulfilled locally, but TCGPlayer fulfillment sync was skipped because the order requires tracked shipping.`
    }

    try {
      await markTcgplayerOrderShipped({
        orderNumber: order.externalId,
      })
    } catch (error) {
      return `Warning: ${order.orderNumber} marked fulfilled locally, but TCGPlayer fulfillment sync failed: ${formatGenericError(error)}`
    }

    return undefined
  }

  if (order.channel !== 'manapool') {
    return undefined
  }

  const purchasedShipment = findBlockingShipment(shipments)
  if (
    !purchasedShipment ||
    !purchasedShipment.trackingNumber ||
    !purchasedShipment.carrier
  ) {
    return `Warning: ${order.orderNumber} marked fulfilled locally, but ManaPool sync was skipped because no active purchased shipment with tracking was found.`
  }

  try {
    await updateManapoolOrderFulfillment({
      orderId: order.externalId,
      fulfillment: {
        status: 'shipped',
        tracking_company: purchasedShipment.carrier,
        tracking_number: purchasedShipment.trackingNumber,
        tracking_url: purchasedShipment.trackerPublicUrl ?? null,
        in_transit_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    return `Warning: ${order.orderNumber} marked fulfilled locally, but ManaPool fulfillment sync failed: ${formatGenericError(error)}`
  }

  return undefined
}

export const setFulfillmentStatus = action({
  args: {
    orderId: v.id('orders'),
    fulfilled: v.boolean(),
  },
  handler: async (ctx, { orderId, fulfilled }) => {
    const { order, shipments } = await loadOrderContext(ctx, orderId)

    await ctx.runMutation(api.orders.mutations.setFulfillmentStatus, {
      orderId,
      fulfilled,
    })

    const warning = await syncMarketplaceFulfillmentForOrder(
      order,
      shipments,
      fulfilled,
    )

    return {
      ...(warning ? { warning } : {}),
    }
  },
})
