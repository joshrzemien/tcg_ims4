import type { useQuery } from 'convex/react'
import type { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { ShippingMethod } from '../../../shared/shippingMethod'
import type { ShippingStatus } from '../../../shared/shippingStatus'

export type OrderRow = {
  _id: Doc<'orders'>['_id']
  externalId: string
  orderNumber: string
  channel: string
  customerName: string
  isFulfilled: boolean
  shippingAddress: Doc<'orders'>['shippingAddress']
  totalAmountCents: number
  itemCount: number
  createdAt: number
  updatedAt: number
  shippingStatus: ShippingStatus
  shippingMethod: ShippingMethod
  trackingPublicUrl?: string
  shipmentCount: number
  reviewShipmentCount: number
  activeShipment?: {
    _id: Doc<'shipments'>['_id']
    easypostShipmentId: string
    status: ShippingStatus
    trackingNumber?: string
    labelUrl?: string
    refundStatus?: string
    trackingStatus?: ShippingStatus
    carrier?: string
    service?: string
    rateCents?: number
    trackerPublicUrl?: string
    createdAt?: number
    updatedAt?: number
  }
  latestShipment?: {
    _id: Doc<'shipments'>['_id']
    easypostShipmentId: string
    status: ShippingStatus
    trackingNumber?: string
    labelUrl?: string
    refundStatus?: string
    trackingStatus?: ShippingStatus
    carrier?: string
    service?: string
    rateCents?: number
    trackerPublicUrl?: string
    createdAt?: number
    updatedAt?: number
  }
}

export type OrdersPage = {
  page: Array<OrderRow>
  continueCursor: string
  isDone: boolean
}

export type ManagedShipment = Doc<'shipments'>
export type OrderPickContext = NonNullable<
  ReturnType<typeof useQuery<typeof api.orders.queries.getPickContext>>
>
export type OrderPickItem = OrderPickContext['items'][number]

export type PurchaseQuote = {
  shippingMethod: ShippingMethod
  predefinedPackage: 'letter' | 'parcel'
  weightOz: number
  quantity: number
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
  rate: {
    rateId: string
    carrier: string
    service: string
    rateCents: number
    deliveryDays: number | null
  }
}

export type PurchaseResult = {
  labelUrl?: string
}

export type FulfillmentResult = {
  warning?: string
}

export type ExportDocumentResult = {
  base64Data: string
  fileName: string
  mimeType: string
  orderCount: number
}

export type PresetFilter = 'all' | 'last7' | 'last30' | 'unfulfilled'
export type ExportKind = 'pull sheets' | 'packing slips'
