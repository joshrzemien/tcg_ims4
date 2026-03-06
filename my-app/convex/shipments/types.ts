import type { ShippingStatus } from '../../shared/shippingStatus'
import type { ShippingMethod } from '../../shared/shippingMethod'

export interface AddressInput {
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  name?: string
  company?: string
  phone?: string
  email?: string
}

export interface CreatedAddress {
  easypostAddressId: string
}

export interface VerifiedAddress {
  easypostAddressId: string
  isVerified: boolean
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  verificationErrors: Array<string>
}

export type ParcelInput =
  | {
      predefinedPackage: 'letter' | 'parcel'
      weight: number
    }
  | {
      length: number
      width: number
      height: number
      weight: number
    }

export interface ShipmentRate {
  rateId: string
  carrier: string
  service: string
  rateCents: number
  deliveryDays: number | null
}

export interface CreatedShipment {
  easypostShipmentId: string
  rates: Array<ShipmentRate>
}

export interface RetrievedShipment {
  easypostShipmentId: string
  status: ShippingStatus
  shippingMethod?: ShippingMethod
  trackingStatus?: ShippingStatus
  refundStatus?: RefundResult['easypostRefundStatus']
  rates: Array<ShipmentRate>
  purchased: boolean
  purchasedData: PurchasedShipment | null
}

export interface PurchasedShipment {
  trackingNumber: string
  labelUrl: string
  rateCents: number
  carrier: string
  service: string
  shippingMethod?: ShippingMethod
  easypostTrackerId: string
  trackerPublicUrl?: string
}

export interface RefundResult {
  easypostRefundStatus:
    | 'submitted'
    | 'refunded'
    | 'rejected'
    | 'not_applicable'
    | 'unknown'
}
