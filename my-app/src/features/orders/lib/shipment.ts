import { isNonRefundableEasyPostLetterShipment } from '../../../../shared/shippingRefund'
import {
  hasRefundedPostage,
  normalizeShippingStatus,
  normalizeStatusToken,
} from '../../../../shared/shippingStatus'
import type { ManagedShipment, OrderPickItem, OrderRow, PurchaseQuote } from '../types'
import { formatCents } from '~/features/shared/lib/formatting'
import { humanizeToken } from '~/features/shared/lib/text'

export function getOrderUrl(order: OrderRow) {
  const encodedOrderNumber = encodeURIComponent(order.orderNumber)
  if (order.channel === 'tcgplayer') {
    return `https://sellerportal.tcgplayer.com/orders/${encodedOrderNumber}`
  }
  if (order.channel === 'manapool') {
    return `https://manapool.com/seller/orders/${encodedOrderNumber}`
  }
  return null
}

const rowSelectionIgnoreSelector = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[data-row-selection-ignore="true"]',
].join(', ')

export function shouldIgnoreRowSelection(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest(rowSelectionIgnoreSelector) !== null
    : false
}

export function shipmentHasPurchasedLabel(shipment?: {
  trackingNumber?: string
  labelUrl?: string
  easypostTrackerId?: string
}) {
  return Boolean(
    shipment?.trackingNumber || shipment?.labelUrl || shipment?.easypostTrackerId,
  )
}

export function canRepurchaseShipment(shipment?: OrderRow['activeShipment']) {
  return !shipment || hasRefundedPostage(shipment.refundStatus)
}

export function canRefundShipment(shipment?: {
  trackingNumber?: string
  labelUrl?: string
  easypostTrackerId?: string
  refundStatus?: string
  trackingStatus?: string
  carrier?: string
  service?: string
  shippingMethod?: string
}) {
  return (
    shipmentHasPurchasedLabel(shipment) &&
    !hasRefundedPostage(shipment?.refundStatus) &&
    normalizeShippingStatus(shipment?.trackingStatus) === 'unknown' &&
    !isNonRefundableEasyPostLetterShipment(shipment)
  )
}

export function shipmentReviewLabel(
  shipment: Pick<ManagedShipment, '_id' | 'refundStatus' | 'trackingStatus' | 'status'>,
  activeShipmentId?: ManagedShipment['_id'],
) {
  if (shipment._id === activeShipmentId) return 'Active'
  if (hasRefundedPostage(shipment.refundStatus)) return 'Refunded'
  if (normalizeShippingStatus(shipment.trackingStatus ?? shipment.status) === 'delivered') {
    return 'Delivered'
  }
  if (normalizeShippingStatus(shipment.trackingStatus) !== 'unknown') {
    return 'Tracked'
  }
  return 'Needs Review'
}

export function formatRateLabel(rate: PurchaseQuote['rate']) {
  const deliveryDays =
    typeof rate.deliveryDays === 'number'
      ? `, ${rate.deliveryDays}d`
      : ''

  return `${rate.carrier} ${rate.service} · ${formatCents(rate.rateCents)}${deliveryDays}`
}

export function formatRefundStatus(refundStatus?: string) {
  if (!refundStatus) return 'Not requested'
  return humanizeToken(normalizeStatusToken(refundStatus))
}

export function formatOrderItemMeta(
  item: Pick<OrderPickItem, 'set' | 'collectorNumber' | 'conditionId' | 'finishId' | 'languageId'>,
) {
  return [
    item.set,
    item.collectorNumber ? `#${item.collectorNumber}` : undefined,
    item.conditionId,
    item.finishId,
    item.languageId,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' · ')
}

export function inventoryStatusTone(orderedQuantity: number, availableQuantity: number) {
  if (availableQuantity >= orderedQuantity) {
    return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
  }

  if (availableQuantity > 0) {
    return 'border-amber-500/20 bg-amber-500/5 text-amber-400'
  }

  return 'border-red-500/20 bg-red-500/5 text-red-400'
}
