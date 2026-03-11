import { describe, expect, it } from 'vitest'

import {
  normalizeWeightOz,
  requireStandaloneAddress,
} from '../../../../convex/shipments/shared/addressValidation'
import {
  buildNormalizedOrder,
  normalizeAddress,
  recipientTokens,
  scoreCandidate,
} from '../../../../convex/shipments/shared/addressMatching'
import { findRateForExpectedService } from '../../../../convex/shipments/workflows/quotes'

describe('convex/shipments helpers', () => {
  it('validates standalone addresses and weight rules', () => {
    expect(
      requireStandaloneAddress({
        name: 'Ada Lovelace',
        street1: '123 Main St',
        city: 'Detroit',
        state: 'MI',
        zip: '48201',
        country: 'US',
      }),
    ).toEqual(
      expect.objectContaining({
        name: 'Ada Lovelace',
        street1: '123 Main St',
      }),
    )
    expect(normalizeWeightOz(3.49, 'Letter')).toBe(3.49)
    expect(() => normalizeWeightOz(4, 'Letter')).toThrow(
      'Letter postage must be 3.5 oz or less.',
    )
  })

  it('scores strong address and recipient matches', () => {
    const order = buildNormalizedOrder({
      _id: 'order-1',
      channel: 'manapool',
      orderNumber: '1001',
      customerName: 'Ada Lovelace',
      shippingAddress: {
        name: 'Ada Lovelace',
        line1: '123 Main Street Apt 5',
        city: 'Detroit',
        state: 'MI',
        postalCode: '48201-1234',
        country: 'US',
      },
      createdAt: 1_000_000,
    })

    const candidate = scoreCandidate({
      shipmentAddress: normalizeAddress({
        street1: '123 Main St',
        city: 'Detroit',
        state: 'MI',
        zip: '48201',
        country: 'US',
      }),
      shipmentRecipient: 'ada lovelace',
      shipmentRecipientTokens: recipientTokens('ada lovelace'),
      shipmentTime: 1_000_000 + 60_000,
      order,
      usedOrderIds: new Set(),
      orderLookbackDays: 45,
      orderLookaheadDays: 3,
      maxTimeDistanceDays: 45,
      preferUnlinkedOrders: true,
    })

    expect(candidate?.score).toBeGreaterThan(90)
    expect(candidate?.reasons).toContain('recipient_exact')
  })

  it('selects the expected EasyPost service rate', () => {
    expect(
      findRateForExpectedService(
        [
          { rateId: 'rate-1', carrier: 'USPS', service: 'First', rateCents: 399, deliveryDays: 3 },
          { rateId: 'rate-2', carrier: 'USPS', service: 'GroundAdvantage', rateCents: 499, deliveryDays: 4 },
        ],
        'First',
      )?.rateId,
    ).toBe('rate-1')
  })
})
