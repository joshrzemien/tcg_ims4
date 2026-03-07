// Historical import: ON_DEMAND
// Live status refresh: hourly cron

import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { fetchManapoolOrders } from '../orders/sources/manapool'
import { fetchTcgplayerOrders } from '../orders/sources/tcgplayer'
import { deriveEasyPostShippingMethod } from '../../shared/shippingMethod'
import {
  deriveShipmentShippingStatus,
  normalizeShippingStatus,
} from '../utils/shippingStatus'
import { getShipment } from './sources/easypost'
import type { ActionCtx } from '../_generated/server'
import type { OrderRecord } from '../orders/types'

const DEFAULT_START_DATE = '2025-11-01T00:00:00.000Z'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const HISTORICAL_SYNC_WINDOW_DAYS = 30

type HistoricalOrder = {
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
}

type NormalizedAddress = {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

type NormalizedOrder = {
  order: HistoricalOrder
  createdAt: number
  recipient: string
  recipientTokens: Set<string>
  address: NormalizedAddress
}

type CandidateScore = {
  candidate: NormalizedOrder
  score: number
  timeDistanceMs: number
  reasons: Array<string>
}

type StoredShipment = {
  _id: string
  orderId?: string
  easypostShipmentId: string
  status?: string
  trackingStatus?: string
  refundStatus?: string
  trackingNumber?: string
  labelUrl?: string
  easypostTrackerId?: string
  trackerPublicUrl?: string
  createdAt?: number
  updatedAt?: number
}

async function upsertOrdersInBatches(
  ctx: ActionCtx,
  orders: Array<OrderRecord>,
  chunkSize = 25,
) {
  for (let i = 0; i < orders.length; i += chunkSize) {
    const batch = orders.slice(i, i + chunkSize)
    await ctx.runMutation(internal.orders.mutations.upsertOrdersBatch, {
      orders: batch,
    })
  }
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

function buildDateWindows(
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
): Promise<Array<any>> {
  let hasMore = true
  let beforeId: string | undefined
  const shipments: Array<any> = []
  const queryStart = new Date(startDate.getTime() - 1)
  const queryEnd = new Date(endDate.getTime() + 1)

  while (hasMore) {
    const params = new URLSearchParams({
      page_size: '100',
      start_datetime: queryStart.toISOString(),
      end_datetime: queryEnd.toISOString(),
    })
    if (beforeId) params.set('before_id', beforeId)

    const res = await fetch(
      `https://api.easypost.com/v2/shipments?${params}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )

    if (!res.ok) {
      throw new Error(`EasyPost list failed: ${res.status} ${await res.text()}`)
    }

    const data = await res.json()
    const pageShipments = (data.shipments ?? []).filter((shipment: any) => {
      if (!shipment.created_at) return false
      const createdAt = new Date(shipment.created_at).getTime()
      return (
        createdAt >= startDate.getTime() && createdAt <= endDate.getTime()
      )
    })
    shipments.push(...pageShipments)

    console.log(
      `Window ${startDate.toISOString()} - ${endDate.toISOString()} page fetched: ${pageShipments.length} shipments kept, has_more: ${data.has_more}, total so far: ${shipments.length}`,
    )

    const fetchedShipments = data.shipments ?? []
    hasMore = data.has_more === true && fetchedShipments.length > 0
    if (fetchedShipments.length > 0) {
      beforeId = fetchedShipments[fetchedShipments.length - 1].id
    }
  }

  shipments.sort((left, right) => {
    const leftTime = left.created_at
      ? new Date(left.created_at).getTime()
      : Number.NEGATIVE_INFINITY
    const rightTime = right.created_at
      ? new Date(right.created_at).getTime()
      : Number.NEGATIVE_INFINITY
    return rightTime - leftTime
  })

  return shipments
}

function createdAtMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStreet(value: unknown): string {
  const withoutUnit = normalizeText(value)
    .replace(/\b(?:apartment|apt|unit|suite|ste|floor|fl)\b\s*\w*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokenMap: Record<string, string> = {
    street: 'st',
    avenue: 'ave',
    road: 'rd',
    boulevard: 'blvd',
    drive: 'dr',
    lane: 'ln',
    court: 'ct',
    place: 'pl',
    circle: 'cir',
    terrace: 'ter',
    parkway: 'pkwy',
    highway: 'hwy',
    north: 'n',
    south: 's',
    east: 'e',
    west: 'w',
  }

  return withoutUnit
    .split(' ')
    .filter(Boolean)
    .map((token) => tokenMap[token] ?? token)
    .join(' ')
}

function normalizePostalCode(value: unknown): string {
  const text = String(value ?? '')
  const usZip = text.match(/\d{5}/)?.[0]
  return usZip ?? normalizeText(text)
}

function normalizeAddress(addr: {
  street1?: string
  line1?: string
  city?: string
  state?: string
  zip?: string
  postalCode?: string
  country?: string
}): NormalizedAddress {
  return {
    street: normalizeStreet(addr.street1 ?? addr.line1),
    city: normalizeText(addr.city),
    state: normalizeText(addr.state),
    zip: normalizePostalCode(addr.zip ?? addr.postalCode),
    country: normalizeText(addr.country),
  }
}

function normalizeRecipient(value: unknown): string {
  return normalizeText(value)
}

function recipientTokens(value: string): Set<string> {
  return new Set(value.split(' ').filter((token) => token.length >= 2))
}

function hasRecipientOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) return true
  }
  return false
}

function indexOrdersByField(
  orders: Array<NormalizedOrder>,
  field: keyof NormalizedAddress,
) {
  const index = new Map<string, Array<NormalizedOrder>>()

  for (const order of orders) {
    const key = order.address[field]
    if (!key) continue
    const existing = index.get(key) ?? []
    existing.push(order)
    index.set(key, existing)
  }

  return index
}

function candidatePoolForShipment(
  byZip: Map<string, Array<NormalizedOrder>>,
  byStreet: Map<string, Array<NormalizedOrder>>,
  address: NormalizedAddress,
): Array<NormalizedOrder> {
  const pool = new Map<string, NormalizedOrder>()

  for (const candidate of byZip.get(address.zip) ?? []) {
    pool.set(candidate.order._id, candidate)
  }

  for (const candidate of byStreet.get(address.street) ?? []) {
    pool.set(candidate.order._id, candidate)
  }

  return [...pool.values()]
}

function scoreCandidate(params: {
  shipmentAddress: NormalizedAddress
  shipmentRecipient: string
  shipmentRecipientTokens: Set<string>
  shipmentTime: number
  order: NormalizedOrder
  usedOrderIds: Set<string>
  orderLookbackDays: number
  orderLookaheadDays: number
  maxTimeDistanceDays: number
  preferUnlinkedOrders: boolean
}): CandidateScore | null {
  const {
    shipmentAddress,
    shipmentRecipient,
    shipmentRecipientTokens,
    shipmentTime,
    order,
    usedOrderIds,
    orderLookbackDays,
    orderLookaheadDays,
    maxTimeDistanceDays,
    preferUnlinkedOrders,
  } = params

  const orderTime = createdAtMs(order.createdAt)
  const earliestOrderTime = shipmentTime - orderLookbackDays * MS_PER_DAY
  const latestOrderTime = shipmentTime + orderLookaheadDays * MS_PER_DAY
  if (orderTime < earliestOrderTime || orderTime > latestOrderTime) {
    return null
  }

  const timeDistanceMs = Math.abs(orderTime - shipmentTime)
  if (timeDistanceMs > maxTimeDistanceDays * MS_PER_DAY) {
    return null
  }

  const streetMatches =
    shipmentAddress.street !== '' &&
    shipmentAddress.street === order.address.street
  const zipMatches =
    shipmentAddress.zip !== '' && shipmentAddress.zip === order.address.zip
  const cityMatches =
    shipmentAddress.city !== '' && shipmentAddress.city === order.address.city
  const stateMatches =
    shipmentAddress.state !== '' &&
    shipmentAddress.state === order.address.state
  const countryMatches =
    shipmentAddress.country !== '' &&
    order.address.country !== '' &&
    shipmentAddress.country === order.address.country

  const strongStreetZipMatch = streetMatches && zipMatches
  const strongStreetCityStateMatch =
    streetMatches && cityMatches && stateMatches
  if (!strongStreetZipMatch && !strongStreetCityStateMatch) {
    return null
  }

  let score = 0
  const reasons: Array<string> = []

  score += 40
  reasons.push('street')
  if (zipMatches) {
    score += 30
    reasons.push('zip')
  }
  if (cityMatches) {
    score += 10
    reasons.push('city')
  }
  if (stateMatches) {
    score += 10
    reasons.push('state')
  }
  if (countryMatches) {
    score += 5
    reasons.push('country')
  }

  if (shipmentRecipient && order.recipient) {
    if (shipmentRecipient === order.recipient) {
      score += 12
      reasons.push('recipient_exact')
    } else if (
      hasRecipientOverlap(shipmentRecipientTokens, order.recipientTokens)
    ) {
      score += 6
      reasons.push('recipient_partial')
    }
  }

  const timeDistanceDays = timeDistanceMs / MS_PER_DAY
  const timeBonus = Math.max(0, 18 - Math.floor(timeDistanceDays))
  if (timeBonus > 0) {
    score += timeBonus
    reasons.push('time')
  }

  if (preferUnlinkedOrders && usedOrderIds.has(order.order._id)) {
    score -= 8
    reasons.push('reused_order')
  }

  return { candidate: order, score, timeDistanceMs, reasons }
}

function snapshotEasyPostAddress(addr: any) {
  if (!addr || typeof addr !== 'object') return undefined
  return {
    id: addr.id,
    name: addr.name,
    company: addr.company,
    street1: addr.street1,
    street2: addr.street2,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country,
    phone: addr.phone,
    email: addr.email,
    residential: addr.residential,
  }
}

function isTerminalShipmentStatus(status: unknown): boolean {
  const canonical = normalizeShippingStatus(status)
  return (
    canonical === 'delivered' ||
    canonical === 'return_to_sender' ||
    canonical === 'failure' ||
    canonical === 'error' ||
    canonical === 'cancelled'
  )
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

    console.log(
      `Historical shipment sync will process ${windows.length} window(s) of up to ${HISTORICAL_SYNC_WINDOW_DAYS} days from ${startDate.toISOString()} through ${syncEndDate.toISOString()}`,
    )

    if (backfillOrders) {
      const [manapoolOrders, tcgplayerOrders] = await Promise.all([
        fetchManapoolOrders({ since: startDate, batchDetails: true }),
        fetchTcgplayerOrders({ since: startDate, batchDetails: true }),
      ])

      const backfilledOrders = [...manapoolOrders, ...tcgplayerOrders].filter(
        (order) => {
          if (!endDate) return true
          return (
            createdAtMs(order.createdAt) <=
            endDate.getTime() + orderLookaheadDays * MS_PER_DAY
          )
        },
      )

      console.log(`Backfetched ${backfilledOrders.length} orders for matching`)
      await upsertOrdersInBatches(ctx, backfilledOrders, orderBatchSize)
    }

    const orders = (await ctx.runQuery(
      api.orders.queries.list,
    )) as Array<HistoricalOrder>
    const earliestOrderTime =
      startDate.getTime() - orderLookbackDays * MS_PER_DAY
    const latestOrderTime =
      syncEndDate.getTime() + orderLookaheadDays * MS_PER_DAY

    const normalizedOrders = orders
      .filter((order) => {
        const createdAt = createdAtMs(order.createdAt)
        return createdAt >= earliestOrderTime && createdAt <= latestOrderTime
      })
      .map((order) => {
        const recipient = normalizeRecipient(
          order.shippingAddress.name || order.customerName,
        )
        return {
          order,
          createdAt: createdAtMs(order.createdAt),
          recipient,
          recipientTokens: recipientTokens(recipient),
          address: normalizeAddress({
            line1: order.shippingAddress.line1,
            city: order.shippingAddress.city,
            state: order.shippingAddress.state,
            postalCode: order.shippingAddress.postalCode,
            country: order.shippingAddress.country,
          }),
        }
      })

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

      console.log(
        `Processing ${windowShipments.length} shipment(s) for window ${window.start.toISOString()} - ${window.end.toISOString()}`,
      )

      for (const ep of windowShipments) {
        const toAddr = ep.to_address
        const shipmentAddress = normalizeAddress({
          street1: toAddr?.street1,
          city: toAddr?.city,
          state: toAddr?.state,
          zip: toAddr?.zip,
          country: toAddr?.country,
        })
        const shipmentRecipient = normalizeRecipient(toAddr?.name)
        const shipmentRecipientSet = recipientTokens(shipmentRecipient)
        const shipmentTime = ep.created_at
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
          .filter((candidate): candidate is CandidateScore => candidate !== null)
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score
            return left.timeDistanceMs - right.timeDistanceMs
          })

        const bestMatch = ranked.length > 0 ? ranked[0] : undefined
        const runnerUp = ranked.length > 1 ? ranked[1] : undefined
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

        const shipment: any = {
          orderId: order?._id ?? undefined,
          status,
          easypostShipmentId: ep.id,
          ...(shippingMethod && { shippingMethod }),
          ...(trackingStatus && { trackingStatus }),
          addressVerified: true,
          toAddress: snapshotEasyPostAddress(toAddr),
          toAddressId: toAddr?.id,
          fromAddressId: ep.from_address?.id,
          rates: (ep.rates ?? []).map((r: any) => ({
            rateId: r.id,
            carrier: r.carrier,
            service: r.service,
            rateCents: Math.round(parseFloat(r.rate) * 100),
            ...(r.delivery_days != null && { deliveryDays: r.delivery_days }),
          })),
          ...(ep.tracking_code && { trackingNumber: ep.tracking_code }),
          ...(ep.postage_label?.label_url && {
            labelUrl: ep.postage_label.label_url,
          }),
          ...(ep.selected_rate?.rate && {
            rateCents: Math.round(parseFloat(ep.selected_rate.rate) * 100),
          }),
          ...(ep.selected_rate?.carrier && {
            carrier: ep.selected_rate.carrier,
          }),
          ...(ep.selected_rate?.service && { service: ep.selected_rate.service }),
          ...(ep.tracker?.id && { easypostTrackerId: ep.tracker.id }),
          ...(ep.tracker?.public_url && {
            trackerPublicUrl: ep.tracker.public_url,
          }),
          ...(refundStatus && { refundStatus }),
          createdAt: shipmentTime,
          updatedAt: Date.now(),
        }

        if (order) {
          matched++
          usedOrderIds.add(order._id)
        } else {
          unmatched++

          if (bestMatch == null) {
            console.warn(`No order match for shipment ${ep.id}`)
          } else if (!isStrongEnough) {
            weakMatches++
            console.warn(
              `Rejected weak order match for shipment ${ep.id}: score=${bestMatch.score}, order=${bestMatch.candidate.order.orderNumber}, reasons=${bestMatch.reasons.join(',')}`,
            )
          } else if (isAmbiguous) {
            ambiguousMatches++
            console.warn(
              `Rejected ambiguous order match for shipment ${ep.id}: top score=${bestMatch.score}, candidates=${ranked
                .slice(0, 3)
                .map((candidate) => candidate.candidate.order.orderNumber)
                .join(', ')}`,
            )
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

export const refreshActiveStatuses = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const apiKey = process.env.EASYPOST_API_KEY!
    const max = limit ?? 100
    const shipments = (await ctx.runQuery(
      api.shipments.queries.list,
    )) as Array<StoredShipment>
    const candidates = shipments
      .filter(
        (shipment) =>
          shipment.orderId && !isTerminalShipmentStatus(shipment.status),
      )
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
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
            ...(latest.shippingMethod && {
              shippingMethod: latest.shippingMethod,
            }),
            ...(latest.trackingStatus && {
              trackingStatus: latest.trackingStatus,
            }),
            ...(latest.refundStatus && { refundStatus: latest.refundStatus }),
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
