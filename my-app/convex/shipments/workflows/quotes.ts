import { v } from 'convex/values'
import { action } from '../../_generated/server'
import { deriveShippingPurchasePlan } from '../../../shared/shippingPurchase'
import { createShipment, verifyAddress } from '../sources/easypost'
import {
  
  configuredCarrierAccountIds,
  normalizeWeightOz,
  requireEnv,
  requireOrderAddress,
  requireStandaloneAddress,
  resolveFromAddressId,
  standaloneAddressValidator
} from '../shared/addressValidation'
import {
  
  
  findBlockingShipment,
  formatActiveShipmentMessage,
  formatEasyPostError,
  loadOrderContext 
} from './shared'
import type {OrderDoc, QuoteBase, QuoteResult 
} from './shared';
import type {StandalonePostageInput} from '../shared/addressValidation';
import type { ShipmentRate } from '../types'

function sortRates(rates: Array<ShipmentRate>): Array<ShipmentRate> {
  return [...rates].sort((left, right) => {
    if (left.rateCents !== right.rateCents) {
      return left.rateCents - right.rateCents
    }

    return left.service.localeCompare(right.service)
  })
}

function expectedServiceForMethod(
  shippingMethod: QuoteBase['shippingMethod'],
): QuoteBase['service'] {
  return shippingMethod === 'Letter' ? 'First' : 'GroundAdvantage'
}

export function findRateForExpectedService(
  rates: Array<ShipmentRate>,
  expectedService: QuoteBase['service'],
): ShipmentRate | null {
  const matches = rates.filter((rate) => rate.service === expectedService)
  if (matches.length === 1) {
    return matches[0]
  }

  if (matches.length === 0) {
    return null
  }

  throw new Error(
    `Expected exactly one ${expectedService} rate from EasyPost, received ${matches.length}.`,
  )
}

async function buildQuoteForPlan(params: {
  shippingMethod: QuoteBase['shippingMethod']
  predefinedPackage: QuoteBase['predefinedPackage']
  weightOz: number
  toAddress: ReturnType<typeof requireStandaloneAddress>
}) {
  const apiKey = requireEnv('EASYPOST_API_KEY')

  const [verifiedAddress, fromAddressId] = await Promise.all([
    verifyAddress(apiKey, params.toAddress),
    resolveFromAddressId(apiKey),
  ])

  const createdShipment = await createShipment(apiKey, {
    fromAddressId,
    toAddressId: verifiedAddress.easypostAddressId,
    parcel: {
      predefinedPackage: params.predefinedPackage,
      weight: params.weightOz,
    },
    carrierAccountIds: configuredCarrierAccountIds(),
  })

  return {
    shippingMethod: params.shippingMethod,
    predefinedPackage: params.predefinedPackage,
    weightOz: params.weightOz,
    service: expectedServiceForMethod(params.shippingMethod),
    addressVerified: verifiedAddress.isVerified,
    verificationErrors: verifiedAddress.verificationErrors,
    verifiedAddress: {
      street1: verifiedAddress.street1,
      ...(verifiedAddress.street2 ? { street2: verifiedAddress.street2 } : {}),
      city: verifiedAddress.city,
      state: verifiedAddress.state,
      zip: verifiedAddress.zip,
      country: verifiedAddress.country,
    },
    easypostShipmentId: createdShipment.easypostShipmentId,
    toAddressId: verifiedAddress.easypostAddressId,
    fromAddressId,
    rates: sortRates(createdShipment.rates),
  }
}

export async function buildQuote(order: OrderDoc): Promise<QuoteResult> {
  const purchasePlan = deriveShippingPurchasePlan(order)
  const quote = await buildQuoteForPlan({
    shippingMethod: purchasePlan.shippingMethod,
    predefinedPackage: purchasePlan.predefinedPackage,
    weightOz: purchasePlan.weightOz,
    toAddress: requireOrderAddress(order),
  })

  return {
    ...quote,
    quantity: purchasePlan.quantity,
  }
}

export async function buildStandaloneQuote(
  input: StandalonePostageInput,
): Promise<QuoteBase> {
  return await buildQuoteForPlan({
    shippingMethod: input.shippingMethod,
    predefinedPackage: input.shippingMethod === 'Letter' ? 'letter' : 'parcel',
    weightOz: normalizeWeightOz(input.weightOz, input.shippingMethod),
    toAddress: requireStandaloneAddress(input.address),
  })
}

export const previewPurchase = action({
  args: {
    orderId: v.id('orders'),
  },
  handler: async (ctx, { orderId }) => {
    try {
      const { order, shipments } = await loadOrderContext(ctx, orderId)
      const blockingShipment = findBlockingShipment(shipments)

      if (blockingShipment) {
        throw new Error(formatActiveShipmentMessage(blockingShipment))
      }

      const quote = await buildQuote(order)
      const rate = findRateForExpectedService(quote.rates, quote.service)
      if (!rate) {
        throw new Error(
          `Expected ${quote.service} for this shipment, but EasyPost did not return that service.`,
        )
      }

      return {
        shippingMethod: quote.shippingMethod,
        predefinedPackage: quote.predefinedPackage,
        weightOz: quote.weightOz,
        quantity: quote.quantity,
        service: quote.service,
        addressVerified: quote.addressVerified,
        verificationErrors: quote.verificationErrors,
        verifiedAddress: quote.verifiedAddress,
        rate,
      }
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})

export const previewStandalonePurchase = action({
  args: {
    shippingMethod: v.union(v.literal('Letter'), v.literal('Parcel')),
    weightOz: v.number(),
    address: standaloneAddressValidator,
  },
  handler: async (_ctx, args) => {
    try {
      const quote = await buildStandaloneQuote(args)
      const rate = findRateForExpectedService(quote.rates, quote.service)
      if (!rate) {
        throw new Error(
          `Expected ${quote.service} for this shipment, but EasyPost did not return that service.`,
        )
      }

      return {
        shippingMethod: quote.shippingMethod,
        predefinedPackage: quote.predefinedPackage,
        weightOz: quote.weightOz,
        service: quote.service,
        addressVerified: quote.addressVerified,
        verificationErrors: quote.verificationErrors,
        verifiedAddress: quote.verifiedAddress,
        rate,
      }
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})
