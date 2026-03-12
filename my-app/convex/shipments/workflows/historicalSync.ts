import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { deriveEasyPostShippingMethod } from '../../../shared/shippingMethod'
import { fetchManapoolOrders } from '../../orders/sources/manapool'
import { fetchTcgplayerOrders } from '../../orders/sources/tcgplayer'
import {
  deriveShipmentShippingStatus,
  normalizeShippingStatus,
} from '../../utils/shippingStatus'
import {
  buildNormalizedOrder,
  candidatePoolForShipment,
  createdAtMs,
  indexOrdersByField,
  normalizeAddress,
  recipientTokens,
  scoreCandidate,
  snapshotEasyPostAddress,
} from '../shared/addressMatching'
import type { CandidateScore } from '../shared/addressMatching'
import type { OrderRecord } from '../../orders/types'
import type { ActionCtx } from '../../_generated/server'

const DEFAULT_START_DATE = '2025-11-01T00:00:00.000Z'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const HISTORICAL_SYNC_WINDOW_DAYS = 30

async function upsertOrdersInBatches(
  ctx: ActionCtx,
  orders: Array<OrderRecord>,
  chunkSize = 25,
) {
  for (let index = 0; index < orders.length; index += chunkSize) {
    const batch = orders.slice(index, index + chunkSize)
    await ctx.runMutation(internal.orders.mutations.upsertOrdersBatch, {
      orders: batch,
    })
  }
}

async function loadOrdersInCreatedAtWindow(
  ctx: ActionCtx,
  params: {
    fromCreatedAt: number
    toCreatedAt: number
    pageSize?: number
  },
) {
  const orders: Array<{
    _id: string
    channel: string
    orderNumber: string
    customerName: string
    shippingAddress: {
      name: string
      line1: string
      line2?: string
      city: string
      state: string
      postalCode: string
      country: string
    }
    createdAt: number
  }> = []
  let cursor: string | null = null
  let isDone = false
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 250, 500))

  while (!isDone) {
    const page: {
      page: Array<(typeof orders)[number]>
      continueCursor: string | null
      isDone: boolean
    } = await ctx.runQuery(internal.orders.queries.listWindowPage, {
      fromCreatedAt: params.fromCreatedAt,
      toCreatedAt: params.toCreatedAt,
      paginationOpts: {
        cursor,
        numItems: pageSize,
      },
    })

    orders.push(...page.page)
    cursor = page.continueCursor
    isDone = page.isDone
  }

  return orders
}

function parseDateArg(value: string | undefined, fallbackIso?: string): Date {
  const source = value ?? fallbackIso
  if (!source) {
    throw new Error('Missing required date')
  }

  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${source}`)
  }

  return parsed
}

export function buildDateWindows(
  startDate: Date,
  endDate: Date,
  windowDays: number,
): Array<{ start: Date; end: Date }> {
  if (startDate.getTime() > endDate.getTime()) {
    return []
  }

  const windows: Array<{ start: Date; end: Date }> = []
  let windowStart = new Date(startDate.getTime())

  while (windowStart.getTime() <= endDate.getTime()) {
    const nextWindowStart = new Date(
      windowStart.getTime() + windowDays * MS_PER_DAY,
    )
    const windowEnd = new Date(
      Math.min(nextWindowStart.getTime() - 1, endDate.getTime()),
    )
    windows.push({ start: windowStart, end: windowEnd })
    windowStart = nextWindowStart
  }

  return windows
}

async function fetchHistoricalShipmentsWindow(
  apiKey: string,
  startDate: Date,
  endDate: Date,
) {
  let hasMore = true
  let beforeId: string | undefined
  const shipments: Array<Record<string, any>> = []
  const queryStart = new Date(startDate.getTime() - 1)
  const queryEnd = new Date(endDate.getTime() + 1)

  while (hasMore) {
    const params = new URLSearchParams({
      page_size: '100',
      start_datetime: queryStart.toISOString(),
      end_datetime: queryEnd.toISOString(),
    })
    if (beforeId) {
      params.set('before_id', beforeId)
    }

    const response = await fetch(`https://api.easypost.com/v2/shipments?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(
        `EasyPost list failed: ${response.status} ${await response.text()}`,
      )
    }

    const data = await response.json()
    const pageShipments = (data.shipments ?? []).filter(
      (shipment: Record<string, unknown>) => {
        if (!shipment.created_at) {
          return false
        }

        const createdAt = new Date(String(shipment.created_at)).getTime()
        return createdAt >= startDate.getTime() && createdAt <= endDate.getTime()
      },
    )
    shipments.push(...pageShipments)

    const fetchedShipments = data.shipments ?? []
    hasMore = data.has_more === true && fetchedShipments.length > 0
    if (fetchedShipments.length > 0) {
      beforeId = fetchedShipments[fetchedShipments.length - 1].id
    }
  }

  shipments.sort((left, right) => {
    const leftTime = left.created_at
      ? new Date(String(left.created_at)).getTime()
      : Number.NEGATIVE_INFINITY
    const rightTime = right.created_at
      ? new Date(String(right.created_at)).getTime()
      : Number.NEGATIVE_INFINITY
    return rightTime - leftTime
  })

  return shipments
}

export const syncHistorical = internalAction({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    backfillOrders: v.optional(v.boolean()),
    orderBatchSize: v.optional(v.number()),
    orderLookbackDays: v.optional(v.number()),
    orderLookaheadDays: v.optional(v.number()),
    maxTimeDistanceDays: v.optional(v.number()),
    minimumMatchScore: v.optional(v.number()),
    requireUniqueTopScore: v.optional(v.boolean()),
    preferUnlinkedOrders: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.EASYPOST_API_KEY!
    const startDate = parseDateArg(args.startDate, DEFAULT_START_DATE)
    const endDate = args.endDate ? parseDateArg(args.endDate) : undefined
    const syncEndDate = endDate ?? new Date()
    const backfillOrders = args.backfillOrders ?? true
    const orderBatchSize = args.orderBatchSize ?? 25
    const orderLookbackDays = args.orderLookbackDays ?? 45
    const orderLookaheadDays = args.orderLookaheadDays ?? 3
    const maxTimeDistanceDays = args.maxTimeDistanceDays ?? 45
    const minimumMatchScore = args.minimumMatchScore ?? 85
    const requireUniqueTopScore = args.requireUniqueTopScore ?? true
    const preferUnlinkedOrders = args.preferUnlinkedOrders ?? true
    const windows = buildDateWindows(
      startDate,
      syncEndDate,
      HISTORICAL_SYNC_WINDOW_DAYS,
    )

    if (backfillOrders) {
      const [manapoolOrders, tcgplayerOrders] = await Promise.all([
        fetchManapoolOrders({ since: startDate, batchDetails: true }),
        fetchTcgplayerOrders({ since: startDate, batchDetails: true }),
      ])

      const backfilledOrders = [...manapoolOrders, ...tcgplayerOrders].filter(
        (order) => {
          if (!endDate) {
            return true
          }

          return (
            createdAtMs(order.createdAt) <=
            endDate.getTime() + orderLookaheadDays * MS_PER_DAY
          )
        },
      )

      await upsertOrdersInBatches(ctx, backfilledOrders, orderBatchSize)
    }

    const earliestOrderTime =
      startDate.getTime() - orderLookbackDays * MS_PER_DAY
    const latestOrderTime =
      syncEndDate.getTime() + orderLookaheadDays * MS_PER_DAY
    const orders = await loadOrdersInCreatedAtWindow(ctx, {
      fromCreatedAt: earliestOrderTime,
      toCreatedAt: latestOrderTime,
    })

    const normalizedOrders = orders.map((order) => buildNormalizedOrder(order))
    const ordersByZip = indexOrdersByField(normalizedOrders, 'zip')
    const ordersByStreet = indexOrdersByField(normalizedOrders, 'street')

    let total = 0
    let matched = 0
    let unmatched = 0
    let weakMatches = 0
    let ambiguousMatches = 0
    const usedOrderIds = new Set<string>()

    for (const window of [...windows].reverse()) {
      const windowShipments = await fetchHistoricalShipmentsWindow(
        apiKey,
        window.start,
        window.end,
      )
      total += windowShipments.length

      for (const ep of windowShipments) {
        const toAddress = ep.to_address as Record<string, unknown> | undefined
        const shipmentAddress = normalizeAddress({
          street1: typeof toAddress?.street1 === 'string' ? toAddress.street1 : undefined,
          city: typeof toAddress?.city === 'string' ? toAddress.city : undefined,
          state: typeof toAddress?.state === 'string' ? toAddress.state : undefined,
          zip: typeof toAddress?.zip === 'string' ? toAddress.zip : undefined,
          country: typeof toAddress?.country === 'string' ? toAddress.country : undefined,
        })
        const shipmentRecipient =
          typeof toAddress?.name === 'string' ? toAddress.name.trim().toLowerCase() : ''
        const shipmentRecipientSet = recipientTokens(shipmentRecipient)
        const shipmentTime =
          typeof ep.created_at === 'string'
            ? new Date(ep.created_at).getTime()
            : Date.now()

        const candidatePool = candidatePoolForShipment(
          ordersByZip,
          ordersByStreet,
          shipmentAddress,
        )
        const ranked = candidatePool
          .map((candidate) =>
            scoreCandidate({
              shipmentAddress,
              shipmentRecipient,
              shipmentRecipientTokens: shipmentRecipientSet,
              shipmentTime,
              order: candidate,
              usedOrderIds,
              orderLookbackDays,
              orderLookaheadDays,
              maxTimeDistanceDays,
              preferUnlinkedOrders,
            }),
          )
          .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score
            }

            return left.timeDistanceMs - right.timeDistanceMs
          })

        const hasBestMatch = ranked.length > 0
        const bestMatch: CandidateScore | undefined = hasBestMatch
          ? ranked[0]
          : undefined
        const runnerUp: CandidateScore | undefined =
          ranked.length > 1 ? ranked[1] : undefined
        const isStrongEnough =
          bestMatch != null && bestMatch.score >= minimumMatchScore
        const isAmbiguous =
          requireUniqueTopScore &&
          bestMatch != null &&
          runnerUp != null &&
          runnerUp.score === bestMatch.score &&
          runnerUp.timeDistanceMs === bestMatch.timeDistanceMs

        const order =
          isStrongEnough && !isAmbiguous ? bestMatch.candidate.order : null

        const trackingStatus =
          ep.tracker && (ep.tracker.id != null || ep.tracker.status != null)
            ? normalizeShippingStatus(ep.tracker.status)
            : undefined
        const refundStatus =
          typeof ep.refund_status === 'string' ? ep.refund_status : undefined
        const purchased = !!(ep.tracking_code && ep.postage_label?.label_url)
        const status = deriveShipmentShippingStatus({
          status: purchased ? 'purchased' : 'created',
          trackingStatus,
          refundStatus,
          trackingNumber: ep.tracking_code,
          labelUrl: ep.postage_label?.label_url,
          easypostTrackerId: ep.tracker?.id,
        })
        const shippingMethod = deriveEasyPostShippingMethod({
          carrier: ep.selected_rate?.carrier,
          service: ep.selected_rate?.service,
        })

        const shipment = {
          orderId: order?._id ?? undefined,
          status,
          easypostShipmentId: ep.id,
          ...(shippingMethod ? { shippingMethod } : {}),
          ...(trackingStatus ? { trackingStatus } : {}),
          addressVerified: true,
          toAddress: snapshotEasyPostAddress(toAddress),
          toAddressId: toAddress?.id,
          fromAddressId: ep.from_address?.id,
          rates: (ep.rates ?? []).map((rate: Record<string, any>) => ({
            rateId: rate.id,
            carrier: rate.carrier,
            service: rate.service,
            rateCents: Math.round(parseFloat(rate.rate) * 100),
            ...(rate.delivery_days != null ? { deliveryDays: rate.delivery_days } : {}),
          })),
          ...(ep.tracking_code ? { trackingNumber: ep.tracking_code } : {}),
          ...(ep.postage_label?.label_url
            ? { labelUrl: ep.postage_label.label_url }
            : {}),
          ...(ep.selected_rate?.rate
            ? { rateCents: Math.round(parseFloat(ep.selected_rate.rate) * 100) }
            : {}),
          ...(ep.selected_rate?.carrier ? { carrier: ep.selected_rate.carrier } : {}),
          ...(ep.selected_rate?.service ? { service: ep.selected_rate.service } : {}),
          ...(ep.tracker?.id ? { easypostTrackerId: ep.tracker.id } : {}),
          ...(ep.tracker?.public_url ? { trackerPublicUrl: ep.tracker.public_url } : {}),
          ...(refundStatus ? { refundStatus } : {}),
          createdAt: shipmentTime,
          updatedAt: Date.now(),
        }

        if (order) {
          matched += 1
          usedOrderIds.add(order._id)
        } else {
          unmatched += 1
          if (!hasBestMatch) {
            console.warn(`No order match for shipment ${ep.id}`)
          } else if (!isStrongEnough) {
            weakMatches += 1
          } else if (isAmbiguous) {
            ambiguousMatches += 1
          }
        }

        await ctx.runMutation(internal.shipments.mutations.upsertShipment, {
          shipment,
        })
      }
    }

    return {
      total,
      matched,
      unmatched,
      weakMatches,
      ambiguousMatches,
    }
  },
})
