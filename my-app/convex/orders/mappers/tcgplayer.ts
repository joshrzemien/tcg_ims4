import { normalizeShippingStatus } from '../../utils/shippingStatus'
import { deriveTcgplayerShippingMethod } from '../../../shared/shippingMethod'
import {
  dollarsToCents,
  shouldMarkOrderFulfilled,
  toTimestamp,
} from './shared'
import type { OrderRecord } from '../types'

interface TcgplayerOrderTransaction {
  grossAmount?: number
  shippingAmount?: number
  feeAmount?: number
}

interface TcgplayerShippingAddress {
  recipientName?: string
  addressOne?: string
  addressTwo?: string
  city?: string
  territory?: string
  postalCode?: string
  country?: string
}

interface TcgplayerProduct {
  name?: string
  quantity?: number
  unitPrice?: number
  productId?: string | number
  skuId?: string | number
}

export interface TcgplayerOrderDetail {
  orderNumber: string
  buyerName?: string
  status?: string
  shippingType?: string
  shippingAddress?: TcgplayerShippingAddress
  transaction?: TcgplayerOrderTransaction
  totalAmount?: number
  shippingAmount?: number
  products?: Array<TcgplayerProduct>
  createdAt?: string
}

export function mapTcgplayerOrder(order: TcgplayerOrderDetail): OrderRecord {
  const platformStatus = normalizeShippingStatus(order.status ?? 'pending')
  const tx = order.transaction ?? {}
  const addr = order.shippingAddress ?? {}
  const totalAmountCents = dollarsToCents(tx.grossAmount ?? order.totalAmount)
  const items = (order.products ?? []).map((item) => ({
    name: item.name ?? 'Unknown',
    quantity: item.quantity ?? 1,
    priceCents: dollarsToCents(item.unitPrice),
    productType: 'mtg_single',
    productId: String(item.productId ?? ''),
    mtgjsonId: '',
    set: '',
    languageId: 'EN',
    ...(item.skuId != null && { tcgplayerSku: Number(item.skuId) }),
  }))

  return {
    externalId: order.orderNumber,
    orderNumber: order.orderNumber,
    channel: 'tcgplayer',
    customerName: order.buyerName ?? 'Unknown',
    status: platformStatus,
    shippingStatus: platformStatus,
    ...(shouldMarkOrderFulfilled(platformStatus)
      ? { fulfillmentStatus: true }
      : {}),
    shippingMethod: deriveTcgplayerShippingMethod({
      shippingType: order.shippingType,
      totalAmountCents,
      items: order.products,
    }),
    shippingAddress: {
      name: addr.recipientName ?? order.buyerName ?? 'Unknown',
      line1: addr.addressOne ?? '',
      ...(addr.addressTwo ? { line2: addr.addressTwo } : {}),
      city: addr.city ?? '',
      state: addr.territory ?? '',
      postalCode: addr.postalCode ?? '',
      country: addr.country ?? 'US',
    },
    totalAmountCents,
    shippingCostCents: dollarsToCents(
      tx.shippingAmount ?? order.shippingAmount,
    ),
    feeCents: dollarsToCents(tx.feeAmount),
    refundAmountCents: 0,
    itemCount: items.length,
    items,
    createdAt: toTimestamp(order.createdAt),
    updatedAt: Date.now(),
  }
}
