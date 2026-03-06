import {
  deriveTcgplayerShippingMethod,
  normalizeShippingMethod,
} from './shippingMethod'
import type { ShippingMethod } from './shippingMethod'

export const SHIPPING_PACKAGE_VALUES = ['letter', 'parcel'] as const

export type ShippingPackage = (typeof SHIPPING_PACKAGE_VALUES)[number]

export type ShippingPurchasePlan = {
  shippingMethod: ShippingMethod
  predefinedPackage: ShippingPackage
  weightOz: number
  quantity: number
}

type OrderLike = {
  channel?: unknown
  shippingMethod?: unknown
  totalAmountCents?: unknown
  items?:
    | Array<{
        quantity?: unknown
      }>
    | null
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function totalItemQuantity(
  items:
    | Array<{
        quantity?: unknown
      }>
    | null
    | undefined,
): number {
  return (items ?? []).reduce((total, item) => {
    const quantity = finiteNumberOrZero(item.quantity)
    return total + Math.max(0, quantity)
  }, 0)
}

function deriveLetterWeightOz(quantity: number): number {
  if (quantity <= 0) {
    throw new Error('Cannot purchase letter postage for an order with no items.')
  }

  if (quantity <= 10) return 1
  if (quantity <= 20) return 2
  if (quantity <= 35) return 3

  throw new Error(
    `Letter postage supports up to 35 cards; this order has ${quantity}.`,
  )
}

function deriveParcelWeightOz(quantity: number): number {
  if (quantity <= 0) {
    throw new Error('Cannot purchase parcel postage for an order with no items.')
  }

  if (quantity <= 5) return 1
  if (quantity <= 34) return 2
  if (quantity <= 49) return 3
  if (quantity <= 64) return 4

  throw new Error(
    `Parcel postage supports up to 64 cards; this order has ${quantity}.`,
  )
}

function derivePurchaseShippingMethod(order: OrderLike): ShippingMethod {
  if (order.channel === 'manapool') {
    const shippingMethod = normalizeShippingMethod(order.shippingMethod)
    if (!shippingMethod) {
      throw new Error('Manapool order is missing a usable shipping method.')
    }
    return shippingMethod
  }

  if (order.channel === 'tcgplayer') {
    return deriveTcgplayerShippingMethod({
      shippingType: order.shippingMethod,
      totalAmountCents: order.totalAmountCents,
      items: order.items,
    })
  }

  const fallback = normalizeShippingMethod(order.shippingMethod)
  if (!fallback) {
    throw new Error('Order is missing a usable shipping method.')
  }

  return fallback
}

export function deriveShippingPurchasePlan(order: OrderLike): ShippingPurchasePlan {
  const shippingMethod = derivePurchaseShippingMethod(order)
  const quantity = totalItemQuantity(order.items)

  if (shippingMethod === 'Letter') {
    return {
      shippingMethod,
      predefinedPackage: 'letter',
      weightOz: deriveLetterWeightOz(quantity),
      quantity,
    }
  }

  return {
    shippingMethod,
    predefinedPackage: 'parcel',
    weightOz: deriveParcelWeightOz(quantity),
    quantity,
  }
}
