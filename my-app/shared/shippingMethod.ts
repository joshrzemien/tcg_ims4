import { normalizeStatusToken } from './shippingStatus'

export const SHIPPING_METHOD_VALUES = ['Letter', 'Parcel'] as const

export type ShippingMethod = (typeof SHIPPING_METHOD_VALUES)[number]

const SHIPPING_METHOD_SET = new Set<string>(SHIPPING_METHOD_VALUES)

const SHIPPING_METHOD_ALIASES: Record<string, ShippingMethod> = {
  letter: 'Letter',
  card: 'Letter',
  envelope: 'Letter',
  flat: 'Letter',
  first: 'Letter',
  first_class: 'Letter',
  firstclass: 'Letter',
  first_class_letter: 'Letter',
  first_class_mail: 'Letter',
  first_class_mail_international: 'Letter',
  lettermail: 'Letter',
  pwe: 'Letter',
  plain_white_envelope: 'Letter',
  stamped: 'Letter',
  parcel: 'Parcel',
  package: 'Parcel',
  bubble: 'Parcel',
  bubble_tracked: 'Parcel',
  bubble_mailer: 'Parcel',
  box: 'Parcel',
  box_tracked: 'Parcel',
  expedited: 'Parcel',
  express: 'Parcel',
  first_class_package: 'Parcel',
  first_class_package_service: 'Parcel',
  ground_advantage: 'Parcel',
  groundadvantage: 'Parcel',
  international: 'Parcel',
  parcel_select: 'Parcel',
  priority: 'Parcel',
  priority_mail: 'Parcel',
  tracked: 'Parcel',
  tracked_box: 'Parcel',
  tracked_bubble: 'Parcel',
  tracked_shipping: 'Parcel',
  usps_first_class: 'Letter',
  usps_ground_advantage: 'Parcel',
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function finiteNumberOrZero(value: unknown): number {
  return hasFiniteNumber(value) ? value : 0
}

function totalQuantity(
  items:
    | Array<{
        quantity?: unknown
      }>
    | null
    | undefined,
): number {
  return (items ?? []).reduce((total, item) => {
    const quantity = hasFiniteNumber(item.quantity) ? item.quantity : 0
    return total + Math.max(0, quantity)
  }, 0)
}

function hasNonSingles(
  items:
    | Array<{
        productType?: unknown
      }>
    | null
    | undefined,
): boolean {
  return (items ?? []).some(
    (item) => normalizeStatusToken(item.productType) !== 'mtg_single',
  )
}

export function isShippingMethod(value: string): value is ShippingMethod {
  return SHIPPING_METHOD_SET.has(value)
}

export function normalizeShippingMethod(value: unknown): ShippingMethod | null {
  if (typeof value !== 'string') return null

  if (isShippingMethod(value)) {
    return value
  }

  const normalized = normalizeStatusToken(value)
  return SHIPPING_METHOD_ALIASES[normalized] ?? null
}

export function formatShippingMethodLabel(method: ShippingMethod): string {
  return method
}

export function deriveTcgplayerShippingMethod(params: {
  shippingType?: unknown
  totalAmountCents?: unknown
  items?:
    | Array<{
        quantity?: unknown
      }>
    | null
}): ShippingMethod {
  const rawShippingType = normalizeStatusToken(params.shippingType)
  if (rawShippingType === 'expedited' || rawShippingType === 'international') {
    return 'Parcel'
  }

  const itemQuantity = totalQuantity(params.items)
  const totalAmountCents = finiteNumberOrZero(params.totalAmountCents)

  if (itemQuantity > 35 || totalAmountCents >= 4000) {
    return 'Parcel'
  }

  return 'Letter'
}

export function deriveManapoolShippingMethod(params: {
  shippingMethod?: unknown
  totalAmountCents?: unknown
  items?:
    | Array<{
        quantity?: unknown
        productType?: unknown
      }>
    | null
}): ShippingMethod {
  const mappedShippingMethod = normalizeShippingMethod(params.shippingMethod)
  if (mappedShippingMethod) {
    return mappedShippingMethod
  }

  if (hasNonSingles(params.items)) {
    return 'Parcel'
  }

  const itemQuantity = totalQuantity(params.items)
  const totalAmountCents = finiteNumberOrZero(params.totalAmountCents)

  if (itemQuantity > 14 || totalAmountCents >= 5000) {
    return 'Parcel'
  }

  return 'Letter'
}

export function deriveEasyPostShippingMethod(params: {
  shippingMethod?: unknown
  carrier?: unknown
  service?: unknown
}): ShippingMethod | null {
  const mappedShippingMethod = normalizeShippingMethod(params.shippingMethod)
  if (mappedShippingMethod) {
    return mappedShippingMethod
  }

  const carrier = normalizeStatusToken(params.carrier)
  const service = normalizeStatusToken(params.service)

  if (service === 'unknown') {
    return null
  }

  if (carrier !== 'usps') {
    return 'Parcel'
  }

  if (
    service === 'first' ||
    service === 'first_class_mail_international' ||
    service.includes('letter') ||
    service.includes('flat') ||
    service.includes('postcard') ||
    service.includes('envelope') ||
    service.includes('card')
  ) {
    return 'Letter'
  }

  return 'Parcel'
}

export function deriveShipmentShippingMethod(
  shipment:
    | {
        shippingMethod?: unknown
        carrier?: unknown
        service?: unknown
      }
    | null
    | undefined,
): ShippingMethod | null {
  return deriveEasyPostShippingMethod({
    shippingMethod: shipment?.shippingMethod,
    carrier: shipment?.carrier,
    service: shipment?.service,
  })
}

export function deriveOrderShippingMethod(params: {
  order?:
    | {
        channel?: unknown
        shippingMethod?: unknown
        totalAmountCents?: unknown
        items?:
          | Array<{
              quantity?: unknown
              productType?: unknown
            }>
          | null
      }
    | null
  latestShipment?:
    | {
        shippingMethod?: unknown
        carrier?: unknown
        service?: unknown
      }
    | null
}): ShippingMethod {
  const shipmentShippingMethod = deriveShipmentShippingMethod(
    params.latestShipment,
  )
  if (shipmentShippingMethod) {
    return shipmentShippingMethod
  }

  const channel = normalizeStatusToken(params.order?.channel)
  if (channel === 'tcgplayer') {
    return deriveTcgplayerShippingMethod({
      shippingType: params.order?.shippingMethod,
      totalAmountCents: params.order?.totalAmountCents,
      items: params.order?.items,
    })
  }

  if (channel === 'manapool') {
    return deriveManapoolShippingMethod({
      shippingMethod: params.order?.shippingMethod,
      totalAmountCents: params.order?.totalAmountCents,
      items: params.order?.items,
    })
  }

  return normalizeShippingMethod(params.order?.shippingMethod) ?? 'Parcel'
}
