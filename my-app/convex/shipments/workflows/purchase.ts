import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { action } from '../../lib/auth'
import { DEFAULT_PRINTER_STATION_KEY } from '../../../shared/printing'
import { buyShipment } from '../sources/easypost'
import {
  requireEnv,
  requireNonEmptyField,
  standaloneAddressValidator,
} from '../shared/addressValidation'
import {
  buildQuote,
  buildStandaloneQuote,
  findRateForExpectedService,
} from './quotes'
import {
  findBlockingShipment,
  formatActiveShipmentMessage,
  formatEasyPostError,
  loadOrderContext,
} from './shared'
import type { Id } from '../../_generated/dataModel'
import type { PurchasedShipment } from '../types'

type PrintDispatchResult = {
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
}

type PurchaseActionResult = PurchasedShipment &
  PrintDispatchResult & {
    verificationErrors: Array<string>
  }

export const purchaseLabel = action({
  args: {
    orderId: v.id('orders'),
    expectedRateCents: v.number(),
    allowUnverifiedAddress: v.boolean(),
  },
  handler: async (
    ctx,
    { orderId, expectedRateCents, allowUnverifiedAddress },
  ): Promise<PurchaseActionResult> => {
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

      const shipmentId = await ctx.runMutation(
        internal.shipments.mutations.upsertShipment,
        {
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
        },
      )
      if (!shipmentId) {
        throw new Error('Failed to persist the purchased shipment.')
      }
      const printDispatch: PrintDispatchResult = await ctx.runMutation(
        internal.printing.mutations.enqueueJob,
        {
          stationKey: DEFAULT_PRINTER_STATION_KEY,
          jobType: 'shipping_label',
          sourceKind: 'remote_url',
          sourceUrl: purchased.labelUrl,
          copies: 1,
          dedupeKey: `shipping_label:${shipmentId}:${purchased.labelUrl}`,
          orderId,
          shipmentId,
          metadata: {
            orderNumber: order.orderNumber,
            carrier: purchased.carrier,
            service: purchased.service,
          },
        },
      )

      return {
        ...purchased,
        ...printDispatch,
        verificationErrors: quote.verificationErrors,
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
  handler: async (ctx, args): Promise<PurchaseActionResult> => {
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

      const shipmentId = await ctx.runMutation(
        internal.shipments.mutations.upsertShipment,
        {
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
        },
      )
      if (!shipmentId) {
        throw new Error('Failed to persist the purchased shipment.')
      }
      const printDispatch: PrintDispatchResult = await ctx.runMutation(
        internal.printing.mutations.enqueueJob,
        {
          stationKey: DEFAULT_PRINTER_STATION_KEY,
          jobType: 'shipping_label',
          sourceKind: 'remote_url',
          sourceUrl: purchased.labelUrl,
          copies: 1,
          dedupeKey: `shipping_label:${shipmentId}:${purchased.labelUrl}`,
          shipmentId,
          metadata: {
            carrier: purchased.carrier,
            service: purchased.service,
          },
        },
      )

      return {
        ...purchased,
        ...printDispatch,
        verificationErrors: quote.verificationErrors,
      }
    } catch (error) {
      throw new Error(formatEasyPostError(error))
    }
  },
})
