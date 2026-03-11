import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { ShippingMethod } from '../../../shared/shippingMethod'

export type StandaloneShipment = Doc<'shipments'> & {
  source: 'standalone'
}

export type StandaloneAddressInput = {
  name: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  country: string
}

export type StandaloneFormState = StandaloneAddressInput & {
  shippingMethod: ShippingMethod
  weightOz: string
}

export type StandaloneQuote = {
  shippingMethod: ShippingMethod
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
  rate: {
    rateId: string
    carrier: string
    service: string
    rateCents: number
    deliveryDays: number | null
  }
}

export type StandalonePurchaseResult = {
  labelUrl?: string
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
}
