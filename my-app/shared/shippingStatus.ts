export const SHIPPING_STATUS_VALUES = [
  'pending',
  'processing',
  'created',
  'purchased',
  'pre_transit',
  'in_transit',
  'out_for_delivery',
  'shipped',
  'delivered',
  'available_for_pickup',
  'return_to_sender',
  'failure',
  'error',
  'cancelled',
  'refunded',
  'replaced',
  'unknown',
] as const

export type ShippingStatus = (typeof SHIPPING_STATUS_VALUES)[number]

const SHIPPING_STATUS_SET = new Set<string>(SHIPPING_STATUS_VALUES)
const REFUNDED_POSTAGE_STATUSES = new Set(['submitted', 'refunded'])

const SHIPPING_STATUS_ALIASES: Record<string, ShippingStatus> = {
  canceled: 'cancelled',
  completed: 'shipped',
  completed_paid: 'shipped',
  label_created: 'created',
  pull_queue: 'processing',
  pulling: 'processing',
  ready_for_pickup: 'processing',
  ready_to_ship: 'processing',
  received: 'processing',
  transit: 'in_transit',
}

const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  created: 'Label Created',
  purchased: 'Label Purchased',
  pre_transit: 'Pre-Transit',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  shipped: 'Shipped',
  delivered: 'Delivered',
  available_for_pickup: 'Available for Pickup',
  return_to_sender: 'Return to Sender',
  failure: 'Failure',
  error: 'Error',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  replaced: 'Replaced',
  unknown: 'Unknown',
}

export function normalizeStatusToken(value: unknown): string {
  if (typeof value !== 'string') return 'unknown'

  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  return normalized === '' ? 'unknown' : normalized
}

export function isShippingStatus(value: string): value is ShippingStatus {
  return SHIPPING_STATUS_SET.has(value)
}

export function normalizeShippingStatus(status: unknown): ShippingStatus {
  const normalized = normalizeStatusToken(status)
  const canonical = SHIPPING_STATUS_ALIASES[normalized] ?? normalized
  return isShippingStatus(canonical) ? canonical : 'unknown'
}

export function formatShippingStatusLabel(status: ShippingStatus): string {
  return SHIPPING_STATUS_LABELS[status]
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function timestampValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function hasRefundedPostage(refundStatus: unknown): boolean {
  return REFUNDED_POSTAGE_STATUSES.has(normalizeStatusToken(refundStatus))
}

export function derivePlatformShippingStatus(
  source:
    | {
        status?: unknown
        shippingStatus?: unknown
      }
    | null
    | undefined,
): ShippingStatus {
  return normalizeShippingStatus(source?.status ?? source?.shippingStatus)
}

export function deriveShipmentShippingStatus(
  shipment:
    | {
        status?: unknown
        trackingStatus?: unknown
        refundStatus?: unknown
        trackingNumber?: unknown
        labelUrl?: unknown
        easypostTrackerId?: unknown
      }
    | null
    | undefined,
): ShippingStatus {
  if (!shipment) return 'unknown'
  if (hasRefundedPostage(shipment.refundStatus)) return 'processing'

  const trackingStatus = normalizeShippingStatus(shipment.trackingStatus)
  if (trackingStatus !== 'unknown') {
    return trackingStatus
  }

  const explicitStatus = normalizeShippingStatus(shipment.status)
  if (explicitStatus !== 'unknown') {
    return explicitStatus
  }

  const hasPurchasedLabel =
    hasNonEmptyString(shipment.trackingNumber) ||
    hasNonEmptyString(shipment.labelUrl) ||
    hasNonEmptyString(shipment.easypostTrackerId)

  return hasPurchasedLabel ? 'purchased' : 'created'
}

export function deriveOrderShippingStatus(params: {
  order?: {
    status?: unknown
    shippingStatus?: unknown
  } | null
  latestShipment?: {
    status?: unknown
    trackingStatus?: unknown
    refundStatus?: unknown
    trackingNumber?: unknown
    labelUrl?: unknown
    easypostTrackerId?: unknown
  } | null
}): ShippingStatus {
  if (params.latestShipment) {
    return deriveShipmentShippingStatus(params.latestShipment)
  }

  return derivePlatformShippingStatus(params.order)
}

export function compareShipmentTiming(
  left: { createdAt?: unknown; updatedAt?: unknown },
  right: { createdAt?: unknown; updatedAt?: unknown },
): number {
  const leftCreatedAt = timestampValue(left.createdAt)
  const rightCreatedAt = timestampValue(right.createdAt)
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt
  }

  return timestampValue(left.updatedAt) - timestampValue(right.updatedAt)
}

export function pickLatestShipment<
  T extends { createdAt?: unknown; updatedAt?: unknown },
>(shipments: Array<T>): T | null {
  if (shipments.length === 0) return null

  return shipments.reduce((latest, shipment) =>
    compareShipmentTiming(latest, shipment) >= 0 ? latest : shipment,
  )
}
