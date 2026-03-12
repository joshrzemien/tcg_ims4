import { v } from 'convex/values'
import { api, internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import {  isTerminalShipmentStatus } from '../shared/addressMatching'
import { getShipment } from '../sources/easypost'
import type {StoredShipment} from '../shared/addressMatching';

export const refreshActiveStatuses = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const apiKey = process.env.EASYPOST_API_KEY!
    const max = limit ?? 100
    const shipments = (await ctx.runQuery(
      api.shipments.queries.listRefreshCandidates,
      { limit: max },
    )) as Array<StoredShipment>
    const candidates = shipments
      .filter(
        (shipment) =>
          shipment.orderId && !isTerminalShipmentStatus(shipment.status),
      )
      .slice(0, max)

    let updated = 0
    let failed = 0

    for (const shipment of candidates) {
      try {
        const latest = await getShipment(apiKey, shipment.easypostShipmentId)
        await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
          shipment: {
            orderId: shipment.orderId,
            easypostShipmentId: latest.easypostShipmentId,
            status: latest.status,
            ...(latest.shippingMethod ? { shippingMethod: latest.shippingMethod } : {}),
            ...(latest.trackingStatus ? { trackingStatus: latest.trackingStatus } : {}),
            ...(latest.refundStatus ? { refundStatus: latest.refundStatus } : {}),
            rates: latest.rates,
            ...(latest.purchasedData ?? {}),
            updatedAt: Date.now(),
          },
        })
        updated += 1
      } catch (error) {
        failed += 1
        console.error(
          `Failed to refresh EasyPost shipment ${shipment.easypostShipmentId}:`,
          error,
        )
      }
    }

    return {
      scanned: candidates.length,
      updated,
      failed,
    }
  },
})
