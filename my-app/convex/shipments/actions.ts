import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { action } from '../_generated/server'
import { hasRefundedPostage } from '../../shared/shippingStatus'
import { deriveShippingPurchasePlan } from '../../shared/shippingPurchase'
import {
  EasyPostError,
  buyShipment,
  createAddress,
  createShipment,
  refundShipment as requestRefund,
  verifyAddress,
} from './sources/easypost'
import type { AddressInput, ShipmentRate } from './types'
import type { ActionCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

type OrderDoc = Doc<'orders'>
type ShipmentDoc = Doc<'shipments'>

type QuoteResult = {
  shippingMethod: 'Letter' | 'Parcel'
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
  easypostShipmentId: string
  toAddressId: string
  fromAddressId: string
  rates: Array<ShipmentRate>
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseAddressJson(raw: string): AddressInput {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid EASYPOST_FROM_ADDRESS_JSON: ${(error as Error).message}`,
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('EASYPOST_FROM_ADDRESS_JSON must be a JSON object.')
  }

  const address = parsed as Record<string, unknown>
  const street1 = typeof address.street1 === 'string' ? address.street1.trim() : ''
  const city = typeof address.city === 'string' ? address.city.trim() : ''
  const state = typeof address.state === 'string' ? address.state.trim() : ''
  const zip = typeof address.zip === 'string' ? address.zip.trim() : ''
  const country = typeof address.country === 'string' ? address.country.trim() : ''

  if (!street1 || !city || !state || !zip || !country) {
    throw new Error(
      'EASYPOST_FROM_ADDRESS_JSON must include non-empty street1, city, state, zip, and country fields.',
    )
  }

  return {
    company: typeof address.company === 'string' ? address.company.trim() : undefined,
    street1,
    street2: typeof address.street2 === 'string' ? address.street2 : undefined,
    city,
    state,
    zip,
    country,
    phone: typeof address.phone === 'string' ? address.phone.trim() : undefined,
    name: typeof address.name === 'string' ? address.name.trim() : undefined,
    email: typeof address.email === 'string' ? address.email.trim() : undefined,
  }
}

function resolveFromAddressInput(): AddressInput {
  return parseAddressJson(requireEnv('EASYPOST_FROM_ADDRESS_JSON'))
}

async function resolveFromAddressId(apiKey: string): Promise<string> {
  const configuredId = process.env.EASYPOST_FROM_ADDRESS_ID?.trim()
  if (configuredId) {
    return configuredId
  }

  const createdAddress = await createAddress(apiKey, resolveFromAddressInput())
  return createdAddress.easypostAddressId
}

function configuredCarrierAccountIds(): Array<string> {
  return [requireEnv('EASYPOST_CARRIER_ACCOUNT_ID')]
}

function sortRates(rates: Array<ShipmentRate>): Array<ShipmentRate> {
  return [...rates].sort((left, right) => {
    if (left.rateCents !== right.rateCents) {
      return left.rateCents - right.rateCents
    }

    return left.service.localeCompare(right.service)
  })
}

function expectedServiceForMethod(
  shippingMethod: QuoteResult['shippingMethod'],
): QuoteResult['service'] {
  return shippingMethod === 'Letter' ? 'First' : 'GroundAdvantage'
}

function shipmentHasPurchasedLabel(shipment: ShipmentDoc): boolean {
  return Boolean(
    shipment.trackingNumber || shipment.labelUrl || shipment.easypostTrackerId,
  )
}

function isActivePurchasedShipment(shipment: ShipmentDoc): boolean {
  return shipmentHasPurchasedLabel(shipment) && !hasRefundedPostage(shipment.refundStatus)
}

function findBlockingShipment(shipments: Array<ShipmentDoc>): ShipmentDoc | null {
  return shipments.find(isActivePurchasedShipment) ?? null
}

function requireOrderAddress(order: OrderDoc): AddressInput {
  const address = order.shippingAddress
  const street1 = address.line1.trim()
  const city = address.city.trim()
  const state = address.state.trim()
  const zip = address.postalCode.trim()
  const country = address.country.trim()
  const name = address.name.trim() || order.customerName.trim()

  if (!street1 || !city || !state || !zip || !country || !name) {
    throw new Error(
      `Order ${order.orderNumber} is missing required shipping address fields.`,
    )
  }

  return {
    name,
    street1,
    street2: address.line2?.trim() || address.line3?.trim() || undefined,
    city,
    state,
    zip,
    country,
  }
}

async function loadOrderContext(
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

function findRateForExpectedService(
  rates: Array<ShipmentRate>,
  expectedService: QuoteResult['service'],
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

async function buildQuote(order: OrderDoc): Promise<QuoteResult> {
  const apiKey = requireEnv('EASYPOST_API_KEY')
  const purchasePlan = deriveShippingPurchasePlan(order)
  const toAddress = requireOrderAddress(order)

  const [verifiedAddress, fromAddressId] = await Promise.all([
    verifyAddress(apiKey, toAddress),
    resolveFromAddressId(apiKey),
  ])

  const createdShipment = await createShipment(apiKey, {
    fromAddressId,
    toAddressId: verifiedAddress.easypostAddressId,
    parcel: {
      predefinedPackage: purchasePlan.predefinedPackage,
      weight: purchasePlan.weightOz,
    },
    carrierAccountIds: configuredCarrierAccountIds(),
  })

  return {
    ...purchasePlan,
    service: expectedServiceForMethod(purchasePlan.shippingMethod),
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

function formatActiveShipmentMessage(shipment: ShipmentDoc): string {
  const trackingNumber = shipment.trackingNumber?.trim()
  if (trackingNumber) {
    return `Order already has a purchased label (${trackingNumber}). Use Manage Label to reprint, refund, or repurchase.`
  }

  return 'Order already has a purchased label. Use Manage Label to reprint, refund, or repurchase.'
}

function formatEasyPostError(error: unknown): string {
  if (error instanceof EasyPostError) {
    return `${error.message} [${error.code}]`
  }

  return error instanceof Error ? error.message : 'Unknown shipping error'
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

export const purchaseLabel = action({
  args: {
    orderId: v.id('orders'),
    expectedRateCents: v.number(),
    allowUnverifiedAddress: v.boolean(),
  },
  handler: async (ctx, { orderId, expectedRateCents, allowUnverifiedAddress }) => {
    try {
      const { order, shipments } = await loadOrderContext(ctx, orderId)
      const blockingShipment = findBlockingShipment(shipments)

      if (blockingShipment) {
        throw new Error(formatActiveShipmentMessage(blockingShipment))
      }

      const quote = await buildQuote(order)
      if (!quote.addressVerified && !allowUnverifiedAddress) {
        throw new Error(
          'EasyPost could not verify this address. Review the warning and approve override to continue.',
        )
      }

      const rate = findRateForExpectedService(quote.rates, quote.service)
      if (!rate) {
        throw new Error(
          `Expected ${quote.service} for this shipment, but EasyPost did not return that service.`,
        )
      }

      if (rate.rateCents !== expectedRateCents) {
        throw new Error(
          'Quoted postage changed before purchase. Refresh the quote and confirm the new price before buying.',
        )
      }

      const purchased = await buyShipment(
        requireEnv('EASYPOST_API_KEY'),
        quote.easypostShipmentId,
        rate.rateId,
      )
      const now = Date.now()

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
        shipment: {
          orderId,
          easypostShipmentId: quote.easypostShipmentId,
          status: 'purchased',
          addressVerified: quote.addressVerified,
          toAddress: {
            ...quote.verifiedAddress,
            name: order.shippingAddress.name,
          },
          toAddressId: quote.toAddressId,
          fromAddressId: quote.fromAddressId,
          rates: quote.rates,
          ...purchased,
          createdAt: now,
          updatedAt: now,
        },
      })

      return {
        ...purchased,
        verificationErrors: quote.verificationErrors,
      }
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})

export const refundLabel = action({
  args: {
    orderId: v.id('orders'),
    easypostShipmentId: v.string(),
  },
  handler: async (ctx, { orderId, easypostShipmentId }) => {
    try {
      const { shipments } = await loadOrderContext(ctx, orderId)
      const targetShipment =
        shipments.find(
          (shipment) => shipment.easypostShipmentId === easypostShipmentId,
        ) ?? null

      if (!targetShipment) {
        throw new Error(`Shipment ${easypostShipmentId} not found for this order.`)
      }

      if (!shipmentHasPurchasedLabel(targetShipment)) {
        throw new Error('Only purchased labels can be refunded.')
      }

      const refund = await requestRefund(
        requireEnv('EASYPOST_API_KEY'),
        easypostShipmentId,
      )

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
        shipment: {
          orderId,
          easypostShipmentId,
          refundStatus: refund.easypostRefundStatus,
          updatedAt: Date.now(),
        },
      })

      return refund
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})
