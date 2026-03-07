import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { action } from '../_generated/server'
import { hasRefundedPostage } from '../../shared/shippingStatus'
import { deriveShippingPurchasePlan } from '../../shared/shippingPurchase'
import {
  getNonRefundableEasyPostLetterShipmentMessage,
  isNonRefundableEasyPostLetterShipment,
} from '../../shared/shippingRefund'
import { updateManapoolOrderFulfillment } from '../orders/sources/manapool'
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

type QuoteBase = {
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

type QuoteResult = QuoteBase & {
  quantity: number
}

type StandaloneAddress = {
  name: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
}

type StandalonePostageInput = {
  shippingMethod: 'Letter' | 'Parcel'
  weightOz: number
  address: StandaloneAddress
}

const standaloneAddressValidator = v.object({
  name: v.string(),
  street1: v.string(),
  street2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  country: v.string(),
})

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
  shippingMethod: QuoteBase['shippingMethod'],
): QuoteBase['service'] {
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

function requireNonEmptyField(label: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }
  return trimmed
}

function normalizeWeightOz(weightOz: number, shippingMethod: 'Letter' | 'Parcel') {
  if (!Number.isFinite(weightOz) || weightOz <= 0) {
    throw new Error('Weight must be greater than 0 oz.')
  }

  const normalizedWeightOz = Math.round(weightOz * 100) / 100
  if (shippingMethod === 'Letter' && normalizedWeightOz > 3.5) {
    throw new Error('Letter postage must be 3.5 oz or less.')
  }

  return normalizedWeightOz
}

function requireStandaloneAddress(address: StandaloneAddress): AddressInput {
  return {
    name: requireNonEmptyField('Recipient name', address.name),
    street1: requireNonEmptyField('Street', address.street1),
    street2: address.street2?.trim() || undefined,
    city: requireNonEmptyField('City', address.city),
    state: requireNonEmptyField('State', address.state),
    zip: requireNonEmptyField('ZIP code', address.zip),
    country: requireNonEmptyField('Country', address.country),
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
  toAddress: AddressInput
}): Promise<QuoteBase> {
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

async function buildQuote(order: OrderDoc): Promise<QuoteResult> {
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

async function buildStandaloneQuote(
  input: StandalonePostageInput,
): Promise<QuoteBase> {
  return await buildQuoteForPlan({
    shippingMethod: input.shippingMethod,
    predefinedPackage: input.shippingMethod === 'Letter' ? 'letter' : 'parcel',
    weightOz: normalizeWeightOz(input.weightOz, input.shippingMethod),
    toAddress: requireStandaloneAddress(input.address),
  })
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

function formatGenericError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function syncMarketplaceFulfillmentForOrder(
  order: OrderDoc,
  shipments: Array<ShipmentDoc>,
  fulfilled: boolean,
): Promise<string | undefined> {
  if (!fulfilled || order.channel !== 'manapool') {
    return undefined
  }

  const purchasedShipment = findBlockingShipment(shipments)
  if (
    !purchasedShipment ||
    !purchasedShipment.trackingNumber ||
    !purchasedShipment.carrier
  ) {
    return `Warning: ${order.orderNumber} marked fulfilled locally, but ManaPool sync was skipped because no active purchased shipment with tracking was found.`
  }

  try {
    await updateManapoolOrderFulfillment({
      orderId: order.externalId,
      fulfillment: {
        status: 'shipped',
        tracking_company: purchasedShipment.carrier,
        tracking_number: purchasedShipment.trackingNumber,
        tracking_url: purchasedShipment.trackerPublicUrl ?? null,
        in_transit_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    return `Warning: ${order.orderNumber} marked fulfilled locally, but ManaPool fulfillment sync failed: ${formatGenericError(error)}`
  }

  return undefined
}

export const setFulfillmentStatus = action({
  args: {
    orderId: v.id('orders'),
    fulfilled: v.boolean(),
  },
  handler: async (ctx, { orderId, fulfilled }) => {
    const { order, shipments } = await loadOrderContext(ctx, orderId)

    await ctx.runMutation(api.orders.mutations.setFulfillmentStatus, {
      orderId,
      fulfilled,
    })

    const warning = await syncMarketplaceFulfillmentForOrder(
      order,
      shipments,
      fulfilled,
    )

    return {
      ...(warning ? { warning } : {}),
    }
  },
})

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

export const purchaseStandaloneLabel = action({
  args: {
    shippingMethod: v.union(v.literal('Letter'), v.literal('Parcel')),
    weightOz: v.number(),
    expectedRateCents: v.number(),
    allowUnverifiedAddress: v.boolean(),
    address: standaloneAddressValidator,
  },
  handler: async (ctx, args) => {
    try {
      const quote = await buildStandaloneQuote(args)
      if (!quote.addressVerified && !args.allowUnverifiedAddress) {
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

      if (rate.rateCents !== args.expectedRateCents) {
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
      const recipientName = requireNonEmptyField(
        'Recipient name',
        args.address.name,
      )

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
        shipment: {
          easypostShipmentId: quote.easypostShipmentId,
          status: 'purchased',
          addressVerified: quote.addressVerified,
          toAddress: {
            ...quote.verifiedAddress,
            name: recipientName,
          },
          toAddressId: quote.toAddressId,
          fromAddressId: quote.fromAddressId,
          rates: quote.rates,
          shippingMethod: args.shippingMethod,
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

      if (isNonRefundableEasyPostLetterShipment(targetShipment)) {
        throw new Error(getNonRefundableEasyPostLetterShipmentMessage())
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

export const refundStandaloneLabel = action({
  args: {
    shipmentId: v.id('shipments'),
  },
  handler: async (ctx, { shipmentId }) => {
    try {
      const shipment = await ctx.runQuery(api.shipments.queries.getById, {
        shipmentId,
      })

      if (!shipment) {
        throw new Error(`Shipment ${shipmentId} not found.`)
      }

      if (shipment.orderId) {
        throw new Error('This shipment is linked to an order.')
      }

      if (!shipmentHasPurchasedLabel(shipment)) {
        throw new Error('Only purchased labels can be refunded.')
      }

      if (isNonRefundableEasyPostLetterShipment(shipment)) {
        throw new Error(getNonRefundableEasyPostLetterShipmentMessage())
      }

      const refund = await requestRefund(
        requireEnv('EASYPOST_API_KEY'),
        shipment.easypostShipmentId,
      )

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
        shipment: {
          easypostShipmentId: shipment.easypostShipmentId,
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
