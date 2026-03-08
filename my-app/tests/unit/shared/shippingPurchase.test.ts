import { describe, expect, it } from 'vitest'

import {
  deriveShippingPurchasePlan,
  totalItemQuantity,
} from '../../../shared/shippingPurchase'

describe('shared/shippingPurchase', () => {
  it('totals item quantities while ignoring invalid and negative values', () => {
    expect(
      totalItemQuantity([
        { quantity: 2 },
        { quantity: -4 },
        { quantity: Number.NaN },
        {},
      ]),
    ).toBe(2)
  })

  it('derives letter postage weights at bucket boundaries', () => {
    expect(
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Letter',
        items: [{ quantity: 10 }],
      }),
    ).toMatchObject({
      shippingMethod: 'Letter',
      predefinedPackage: 'letter',
      weightOz: 1,
      quantity: 10,
    })

    expect(
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Letter',
        items: [{ quantity: 20 }],
      }).weightOz,
    ).toBe(2)

    expect(
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Letter',
        items: [{ quantity: 35 }],
      }).weightOz,
    ).toBe(3)
  })

  it('derives parcel postage weights at bucket boundaries', () => {
    expect(
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Parcel',
        items: [{ quantity: 5 }],
      }).weightOz,
    ).toBe(1)

    expect(
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Parcel',
        items: [{ quantity: 34 }],
      }).weightOz,
    ).toBe(2)

    expect(
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Parcel',
        items: [{ quantity: 64 }],
      }).weightOz,
    ).toBe(4)
  })

  it('throws for zero-item orders and overflow quantities', () => {
    expect(() =>
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Letter',
        items: [],
      }),
    ).toThrow('Cannot purchase letter postage for an order with no items.')

    expect(() =>
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Letter',
        items: [{ quantity: 36 }],
      }),
    ).toThrow('Letter postage supports up to 35 cards')

    expect(() =>
      deriveShippingPurchasePlan({
        channel: 'manapool',
        shippingMethod: 'Parcel',
        items: [{ quantity: 65 }],
      }),
    ).toThrow('Parcel postage supports up to 64 cards')
  })
})
