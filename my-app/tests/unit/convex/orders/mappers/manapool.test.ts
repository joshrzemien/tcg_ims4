import { describe, expect, it, vi } from 'vitest'

import { mapManapoolOrder } from '../../../../../convex/orders/mappers/manapool'

describe('convex/orders/mappers/manapool', () => {
  it('maps Manapool orders with mixed product types into the internal order record shape', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T18:00:00.000Z'))

    const order = mapManapoolOrder({
      id: 'order-1',
      created_at: '2026-03-02T00:00:00.000Z',
      latest_fulfillment_status: 'available_for_pickup',
      shipping_method: 'unknown',
      payment: {
        total_cents: 5_500,
        shipping_cents: 499,
        fee_cents: 120,
      },
      shipping_address: {
        name: 'Grace Hopper',
        line1: '123 Fleet St',
        line2: 'Suite 5',
        city: 'Arlington',
        state: 'VA',
        postal_code: '22201',
        country: 'US',
      },
      items: [
        {
          quantity: 2,
          price_cents: 250,
          product_type: 'mtg_single',
          product_id: 'single-1',
          tcgsku: 42,
          product: {
            single: {
              name: 'Lightning Bolt',
              mtgjson_id: 'uuid-1',
              set: 'lea',
              language_id: 'EN',
              condition_id: 'NM',
              finish_id: 'FO',
              number: '123',
              scryfall_id: 'scry-1',
            },
          },
        },
        {
          quantity: 1,
          price_cents: 5_000,
          product_type: 'mtg_sealed',
          product_id: 'sealed-1',
          product: {
            sealed: {
              name: 'Starter Deck',
              mtgjson_id: 'uuid-2',
              set: 'lea',
              language_id: 'EN',
            },
          },
        },
      ],
    })

    expect(order).toEqual({
      externalId: 'order-1',
      orderNumber: 'order-1',
      channel: 'manapool',
      customerName: 'Grace Hopper',
      status: 'available_for_pickup',
      shippingStatus: 'available_for_pickup',
      isFulfilled: true,
      shippingMethod: 'Parcel',
      shippingAddress: {
        name: 'Grace Hopper',
        line1: '123 Fleet St',
        line2: 'Suite 5',
        city: 'Arlington',
        state: 'VA',
        postalCode: '22201',
        country: 'US',
      },
      totalAmountCents: 5_500,
      shippingCostCents: 499,
      feeCents: 120,
      refundAmountCents: 0,
      itemCount: 2,
      items: [
        {
          name: 'Lightning Bolt',
          quantity: 2,
          priceCents: 250,
          productType: 'mtg_single',
          productId: 'single-1',
          mtgjsonId: 'uuid-1',
          set: 'lea',
          languageId: 'EN',
          conditionId: 'NM',
          finishId: 'FO',
          collectorNumber: '123',
          scryfallId: 'scry-1',
          tcgplayerSku: 42,
        },
        {
          name: 'Starter Deck',
          quantity: 1,
          priceCents: 5_000,
          productType: 'mtg_sealed',
          productId: 'sealed-1',
          mtgjsonId: 'uuid-2',
          set: 'lea',
          languageId: 'EN',
        },
      ],
      createdAt: new Date('2026-03-02T00:00:00.000Z').getTime(),
      updatedAt: Date.now(),
    })
  })
})
