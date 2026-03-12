import { hasRefundedPostage } from '../../../shared/shippingStatus'
import { api } from '../../_generated/api'
import { EasyPostError } from '../sources/easypost'
import type { Doc, Id } from '../../_generated/dataModel'
import type { ActionCtx } from '../../_generated/server'
import type { ShipmentRate } from '../types'

export type OrderDoc = Doc<'orders'>
export type ShipmentDoc = Doc<'shipments'>

export type QuoteBase = {
  shippingMethod: 'Letter' | 'Parcel'
  predefinedPackage: 'letter' | 'parcel'
  weightOz: number
  service: 'First' | 'GroundAdvantage'
  addressVerified: boolean
  verificationErrors: Array<string>
  verifiedAddress: {
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  easypostShipmentId: string
  toAddressId: string
  fromAddressId: string
  rates: Array<ShipmentRate>
}

export type QuoteResult = QuoteBase & {
  quantity: number
}

export async function loadOrderContext(
  ctx: ActionCtx,
  orderId: Id<'orders'>,
): Promise<{ order: OrderDoc; shipments: Array<ShipmentDoc> }> {
  const [order, shipments] = await Promise.all([
    ctx.runQuery(api.orders.queries.getById, { orderId }),
    ctx.runQuery(api.shipments.queries.getByOrderId, { orderId }),
  ])

  if (!order) {
    throw new Error(`Order ${orderId} not found.`)
  }

  return { order, shipments }
}

export function shipmentHasPurchasedLabel(shipment: ShipmentDoc): boolean {
  return Boolean(
    shipment.trackingNumber || shipment.labelUrl || shipment.easypostTrackerId,
  )
}

function isActivePurchasedShipment(shipment: ShipmentDoc): boolean {
  return shipmentHasPurchasedLabel(shipment) && !hasRefundedPostage(shipment.refundStatus)
}

export function findBlockingShipment(
  shipments: Array<ShipmentDoc>,
): ShipmentDoc | null {
  return shipments.find(isActivePurchasedShipment) ?? null
}

export function formatActiveShipmentMessage(shipment: ShipmentDoc): string {
  const trackingNumber = shipment.trackingNumber?.trim()
  if (trackingNumber) {
    return `Order already has a purchased label (${trackingNumber}). Use Manage Label to reprint, refund, or repurchase.`
  }

  return 'Order already has a purchased label. Use Manage Label to reprint, refund, or repurchase.'
}

export function formatEasyPostError(error: unknown): string {
  if (error instanceof EasyPostError) {
    return `${error.message} [${error.code}]`
  }

  return error instanceof Error ? error.message : 'Unknown shipping error'
}

export function formatGenericError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
