import { describe, expect, it } from 'vitest'

import {
  deriveEasyPostShippingMethod,
  deriveManapoolShippingMethod,
  deriveOrderShippingMethod,
  deriveTcgplayerShippingMethod,
  formatShippingMethodLabel,
  normalizeShippingMethod,
} from '../../../shared/shippingMethod'

describe('shared/shippingMethod', () => {
  it('normalizes aliases and formats labels', () => {
    expect(normalizeShippingMethod('plain white envelope')).toBe('Letter')
    expect(normalizeShippingMethod('ground_advantage')).toBe('Parcel')
    expect(normalizeShippingMethod('mystery')).toBeNull()
    expect(formatShippingMethodLabel('Letter')).toBe('Letter')
  })

  it('derives TCGplayer shipping method from shipping type and thresholds', () => {
    expect(
      deriveTcgplayerShippingMethod({
        shippingType: 'expedited',
        totalAmountCents: 500,
        items: [{ quantity: 1 }],
      }),
    ).toBe('Parcel')

    expect(
      deriveTcgplayerShippingMethod({
        shippingType: 'standard',
        totalAmountCents: 3_999,
        items: [{ quantity: 35 }],
      }),
    ).toBe('Letter')

    expect(
      deriveTcgplayerShippingMethod({
        shippingType: 'standard',
        totalAmountCents: 4_000,
        items: [{ quantity: 1 }],
      }),
    ).toBe('Parcel')
  })

  it('derives Manapool shipping method from explicit mapping and fallback heuristics', () => {
    expect(
      deriveManapoolShippingMethod({
        shippingMethod: 'pwe',
        totalAmountCents: 10_000,
        items: [{ quantity: 99, productType: 'mtg_single' }],
      }),
    ).toBe('Letter')

    expect(
      deriveManapoolShippingMethod({
        shippingMethod: 'unknown',
        totalAmountCents: 500,
        items: [{ quantity: 1, productType: 'mtg_sealed' }],
      }),
    ).toBe('Parcel')

    expect(
      deriveManapoolShippingMethod({
        shippingMethod: 'unknown',
        totalAmountCents: 4_999,
        items: [{ quantity: 14, productType: 'mtg_single' }],
      }),
    ).toBe('Letter')
  })

  it('derives EasyPost shipping method for USPS letters and non-USPS parcels', () => {
    expect(
      deriveEasyPostShippingMethod({
        carrier: 'USPS',
        service: 'First Class Mail International',
      }),
    ).toBe('Letter')

    expect(
      deriveEasyPostShippingMethod({
        carrier: 'ups',
        service: 'ground',
      }),
    ).toBe('Parcel')

    expect(
      deriveEasyPostShippingMethod({
        carrier: 'usps',
        service: undefined,
      }),
    ).toBeNull()
  })

  it('prefers shipment-derived shipping methods over order heuristics', () => {
    expect(
      deriveOrderShippingMethod({
        order: {
          channel: 'tcgplayer',
          shippingMethod: 'standard',
          totalAmountCents: 100,
          items: [{ quantity: 1 }],
        },
        latestShipment: {
          carrier: 'usps',
          service: 'ground_advantage',
        },
      }),
    ).toBe('Parcel')

    expect(
      deriveOrderShippingMethod({
        order: {
          channel: 'manapool',
          shippingMethod: 'plain white envelope',
          totalAmountCents: 500,
          items: [{ quantity: 1, productType: 'mtg_single' }],
        },
      }),
    ).toBe('Letter')
  })
})
