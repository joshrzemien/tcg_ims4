import type { useQuery } from 'convex/react'
import type { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { ShippingMethod } from '../../../shared/shippingMethod'
import type { ShippingStatus } from '../../../shared/shippingStatus'
import type {
  PrintJobStatus,
  PrinterStationStatus,
} from '../../../shared/printing'

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
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
}

export type FulfillmentResult = {
  warning?: string
}

export type ExportDocumentResult = {
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
  fileName: string
  mimeType: string
  orderCount: number
}

export type PrintDispatchResult = {
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
  orderCount?: number
}

export type PrintJobSummary = {
  _id: Id<'printJobs'>
  stationKey: string
  jobType: 'shipping_label' | 'packing_slip' | 'pull_sheet'
  status: PrintJobStatus
  fileName?: string
  mimeType?: string
  orderId?: Id<'orders'>
  shipmentId?: Id<'shipments'>
  requestedAt: number
  startedAt?: number
  completedAt?: number
  failedAt?: number
  failureCode?: string
  failureMessage?: string
  metadata: {
    orderNumber?: string
    orderCount?: number
    carrier?: string
    service?: string
  }
}

export type PrinterStationSummary = {
  stationKey: string
  name: string
  status: PrinterStationStatus
  lastHeartbeatAt?: number
  lastSeenAt?: number
  capabilities: Array<'shipping_label' | 'packing_slip' | 'pull_sheet'>
}

export type PresetFilter = 'all' | 'last7' | 'last30' | 'unfulfilled'
export type ExportKind = 'pull sheets' | 'packing slips'
