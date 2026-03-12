import { deriveOrderShippingMethod } from '../../shared/shippingMethod'
import {
  deriveOrderShippingStatus,
  hasRefundedPostage,
  normalizeShippingStatus,
  pickLatestShipment,
} from '../utils/shippingStatus'
import type { Doc } from '../_generated/dataModel'
import type { ShippingStatus } from '../../shared/shippingStatus'
import type { ShippingMethod } from '../../shared/shippingMethod'

export type ShipmentSummary = Pick<
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

export type OrderShipmentState = {
  shippingMethod: ShippingMethod
  shippingStatus: ShippingStatus
  trackingPublicUrl?: string
  shipmentCount: number
  reviewShipmentCount: number
  activeShipment?: ShipmentSummary
  latestShipment?: ShipmentSummary
}

type OrderSummarySource = {
  shippingMethod?: unknown
  shippingStatus?: unknown
  shipmentCount?: unknown
  reviewShipmentCount?: unknown
  trackingPublicUrl?: unknown
  activeShipment?: ShipmentSummary | null
  latestShipment?: ShipmentSummary | null
}

type OrderFields = {
  channel?: unknown
  shippingMethod?: unknown
  status?: unknown
  shippingStatus?: unknown
  totalAmountCents?: unknown
  items?:
    | Array<{
        quantity?: unknown
        productType?: unknown
      }>
    | null
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

function shipmentSummaryEquals(
  left: ShipmentSummary | null | undefined,
  right: ShipmentSummary | null | undefined,
) {
  if (!left && !right) return true
  if (!left || !right) return false

  return (
    left._id === right._id &&
    left.easypostShipmentId === right.easypostShipmentId &&
    left.status === right.status &&
    left.trackingNumber === right.trackingNumber &&
    left.labelUrl === right.labelUrl &&
    left.refundStatus === right.refundStatus &&
    left.trackingStatus === right.trackingStatus &&
    left.carrier === right.carrier &&
    left.service === right.service &&
    left.rateCents === right.rateCents &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.trackerPublicUrl === right.trackerPublicUrl
  )
}

export function buildOrderShipmentState(params: {
  order: OrderFields
  shipments: Array<Doc<'shipments'>>
}): OrderShipmentState {
  const latestShipment = pickLatestShipment(params.shipments) ?? undefined
  const activeShipment = selectActiveShipment(params.shipments)
  const reviewShipmentCount = params.shipments.filter((shipment) => {
    if (!shipmentHasPurchasedLabel(shipment)) return false
    if (hasRefundedPostage(shipment.refundStatus)) return false
    if (normalizeShippingStatus(shipment.trackingStatus) !== 'unknown') {
      return false
    }
    return shipment._id !== activeShipment?._id
  }).length

  return {
    shippingMethod: deriveOrderShippingMethod({
      order: params.order,
      latestShipment: activeShipment ?? latestShipment,
    }),
    shippingStatus: deriveOrderShippingStatus({
      order: params.order,
      latestShipment: activeShipment ?? latestShipment,
    }),
    shipmentCount: params.shipments.length,
    reviewShipmentCount,
    trackingPublicUrl:
      typeof activeShipment?.trackerPublicUrl === 'string' &&
      activeShipment.trackerPublicUrl.trim() !== ''
        ? activeShipment.trackerPublicUrl
        : undefined,
    activeShipment: activeShipment
      ? mapShipmentSummary(activeShipment)
      : undefined,
    latestShipment: latestShipment
      ? mapShipmentSummary(latestShipment)
      : undefined,
  }
}

export function readMaterializedOrderShipmentState(
  order: OrderSummarySource,
): OrderShipmentState {
  return {
    shippingMethod: order.shippingMethod as ShippingMethod,
    shippingStatus: order.shippingStatus as ShippingStatus,
    shipmentCount: order.shipmentCount as number,
    reviewShipmentCount: order.reviewShipmentCount as number,
    trackingPublicUrl:
      typeof order.trackingPublicUrl === 'string' &&
      order.trackingPublicUrl.trim() !== ''
        ? order.trackingPublicUrl
        : undefined,
    activeShipment: order.activeShipment ?? undefined,
    latestShipment: order.latestShipment ?? undefined,
  }
}

export function materializedOrderShipmentStateEquals(
  order: OrderSummarySource,
  state: OrderShipmentState,
) {
  return (
    order.shippingMethod === state.shippingMethod &&
    order.shippingStatus === state.shippingStatus &&
    order.shipmentCount === state.shipmentCount &&
    order.reviewShipmentCount === state.reviewShipmentCount &&
    order.trackingPublicUrl === state.trackingPublicUrl &&
    shipmentSummaryEquals(order.activeShipment, state.activeShipment) &&
    shipmentSummaryEquals(order.latestShipment, state.latestShipment)
  )
}
