import { normalizeShippingStatus } from '../../utils/shippingStatus'
import { deriveManapoolShippingMethod } from '../../../shared/shippingMethod'
import type { OrderRecord } from '../types'

interface ManapoolShippingAddress {
  name: string
  line1: string
  line2?: string
  line3?: string
  city: string
  state: string
  postal_code: string
  country: string
}

interface ManapoolPayment {
  total_cents: number
  shipping_cents: number
  fee_cents: number
}

interface ManapoolSingleProductData {
  name?: string
  mtgjson_id?: string
  set?: string
  language_id?: string
  condition_id?: string
  finish_id?: string
  number?: string
  scryfall_id?: string
}

interface ManapoolSealedProductData {
  name?: string
  mtgjson_id?: string
  set?: string
  language_id?: string
}

interface ManapoolOrderItem {
  quantity: number
  price_cents: number
  product_type: string
  product_id: string
  product: {
    single?: ManapoolSingleProductData
    sealed?: ManapoolSealedProductData
  }
  tcgsku?: number
}

export interface ManapoolOrderDetail {
  id: string
  created_at: string
  shipping_address: ManapoolShippingAddress
  latest_fulfillment_status: string | null
  shipping_method: string
  payment: ManapoolPayment
  items: Array<ManapoolOrderItem>
}

export interface ManapoolOrderSummary {
  id: string
  created_at: string
  label: string
  total_cents: number
  shipping_method: string
  latest_fulfillment_status: string | null
}

export function mapManapoolOrder(order: ManapoolOrderDetail): OrderRecord {
  const platformStatus = normalizeShippingStatus(
    order.latest_fulfillment_status ?? 'pending',
  )
  const items = order.items.map((item) => {
    const isSingle = item.product_type === 'mtg_single'

    if (isSingle) {
      const productData = item.product.single
      return {
        name: productData?.name ?? 'Unknown',
        quantity: item.quantity,
        priceCents: item.price_cents,
        productType: item.product_type,
        productId: item.product_id,
        mtgjsonId: productData?.mtgjson_id ?? '',
        set: productData?.set ?? '',
        languageId: productData?.language_id ?? 'EN',
        ...(productData && {
          conditionId: productData.condition_id,
          finishId: productData.finish_id,
          collectorNumber: productData.number,
          scryfallId: productData.scryfall_id,
        }),
        ...(item.tcgsku != null && { tcgplayerSku: item.tcgsku }),
      }
    }

    const productData = item.product.sealed
    return {
      name: productData?.name ?? 'Unknown',
      quantity: item.quantity,
      priceCents: item.price_cents,
      productType: item.product_type,
      productId: item.product_id,
      mtgjsonId: productData?.mtgjson_id ?? '',
      set: productData?.set ?? '',
      languageId: productData?.language_id ?? 'EN',
      ...(item.tcgsku != null && { tcgplayerSku: item.tcgsku }),
    }
  })

  return {
    externalId: order.id,
    orderNumber: order.id,
    channel: 'manapool',
    customerName: order.shipping_address.name,
    status: platformStatus,
    shippingStatus: platformStatus,
    shippingMethod: deriveManapoolShippingMethod({
      shippingMethod: order.shipping_method,
      totalAmountCents: order.payment.total_cents,
      items: order.items.map((item) => ({
        quantity: item.quantity,
        productType: item.product_type,
      })),
    }),
    shippingAddress: {
      name: order.shipping_address.name,
      line1: order.shipping_address.line1,
      ...(order.shipping_address.line2 && {
        line2: order.shipping_address.line2,
      }),
      ...(order.shipping_address.line3 && {
        line3: order.shipping_address.line3,
      }),
      city: order.shipping_address.city,
      state: order.shipping_address.state,
      postalCode: order.shipping_address.postal_code,
      country: order.shipping_address.country,
    },
    totalAmountCents: order.payment.total_cents,
    shippingCostCents: order.payment.shipping_cents,
    feeCents: order.payment.fee_cents,
    refundAmountCents: 0,
    itemCount: items.length,
    items,
    createdAt: new Date(order.created_at).getTime(),
    updatedAt: Date.now(),
  }
}
