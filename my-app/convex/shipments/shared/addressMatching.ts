import { normalizeShippingStatus } from '../../utils/shippingStatus'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type HistoricalOrder = {
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

export type NormalizedAddress = {
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export type NormalizedOrder = {
  order: HistoricalOrder
  createdAt: number
  recipient: string
  recipientTokens: Set<string>
  address: NormalizedAddress
}

export type CandidateScore = {
  candidate: NormalizedOrder
  score: number
  timeDistanceMs: number
  reasons: Array<string>
}

export type StoredShipment = {
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

export function createdAtMs(value: unknown): number {
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

export function normalizeAddress(addr: {
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

export function recipientTokens(value: string): Set<string> {
  return new Set(value.split(' ').filter((token) => token.length >= 2))
}

function hasRecipientOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const token of left) {
    if (right.has(token)) {
      return true
    }
  }

  return false
}

export function buildNormalizedOrder(order: HistoricalOrder): NormalizedOrder {
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
}

export function indexOrdersByField(
  orders: Array<NormalizedOrder>,
  field: keyof NormalizedAddress,
) {
  const index = new Map<string, Array<NormalizedOrder>>()

  for (const order of orders) {
    const key = order.address[field]
    if (!key) {
      continue
    }

    const existing = index.get(key) ?? []
    existing.push(order)
    index.set(key, existing)
  }

  return index
}

export function candidatePoolForShipment(
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

export function scoreCandidate(params: {
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

export function snapshotEasyPostAddress(
  addr: Record<string, unknown> | null | undefined,
) {
  if (!addr) {
    return undefined
  }

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

export function isTerminalShipmentStatus(status: unknown): boolean {
  const canonical = normalizeShippingStatus(status)
  return (
    canonical === 'delivered' ||
    canonical === 'return_to_sender' ||
    canonical === 'failure' ||
    canonical === 'error' ||
    canonical === 'cancelled'
  )
}
