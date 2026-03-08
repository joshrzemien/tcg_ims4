import { describe, expect, it, vi } from 'vitest'

import { mapTcgplayerOrder } from '../../../../../convex/orders/mappers/tcgplayer'

describe('convex/orders/mappers/tcgplayer', () => {
  it('maps TCGplayer orders into the internal order record shape', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T12:34:56.000Z'))

    const order = mapTcgplayerOrder({
      orderNumber: '1001',
      buyerName: 'Ada Lovelace',
      status: 'Shipped Delivered',
      shippingType: 'expedited',
      shippingAddress: {
        recipientName: 'Ada Lovelace',
        addressOne: '1 Main St',
        city: 'Detroit',
        territory: 'MI',
        postalCode: '48201',
        country: 'US',
      },
      transaction: {
        grossAmount: 12.34,
        shippingAmount: 1.23,
        feeAmount: 0.56,
      },
      products: [
        {
          name: 'Black Lotus',
          quantity: 2,
          unitPrice: 5.55,
          productId: 7,
          skuId: 77,
        },
      ],
      createdAt: '2026-03-01T00:00:00.000Z',
    })

    expect(order).toEqual({
      externalId: '1001',
      orderNumber: '1001',
      channel: 'tcgplayer',
      customerName: 'Ada Lovelace',
      status: 'delivered',
      shippingStatus: 'delivered',
      isFulfilled: true,
      shippingMethod: 'Parcel',
      shippingAddress: {
        name: 'Ada Lovelace',
        line1: '1 Main St',
        city: 'Detroit',
        state: 'MI',
        postalCode: '48201',
        country: 'US',
      },
      totalAmountCents: 1234,
      shippingCostCents: 123,
      feeCents: 56,
      refundAmountCents: 0,
      itemCount: 1,
      items: [
        {
          name: 'Black Lotus',
          quantity: 2,
          priceCents: 555,
          productType: 'mtg_single',
          productId: '7',
          languageId: 'EN',
          tcgplayerSku: 77,
        },
      ],
      createdAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
      updatedAt: Date.now(),
    })
  })
})
