import { describe, expect, it } from 'vitest'

import {
  compareShipmentTiming,
  deriveOrderShippingStatus,
  derivePlatformShippingStatus,
  deriveShipmentShippingStatus,
  formatShippingStatusLabel,
  hasRefundedPostage,
  normalizeShippingStatus,
  normalizeStatusToken,
  pickLatestShipment,
} from '../../../shared/shippingStatus'

describe('shared/shippingStatus', () => {
  it('normalizes status tokens from mixed inputs', () => {
    expect(normalizeStatusToken('InTransitNow')).toBe('in_transit_now')
    expect(normalizeStatusToken(' shipped delivered ')).toBe('shipped_delivered')
    expect(normalizeStatusToken('')).toBe('unknown')
    expect(normalizeStatusToken(null)).toBe('unknown')
  })

  it('canonicalizes aliases and formats labels', () => {
    expect(normalizeShippingStatus('canceled')).toBe('cancelled')
    expect(normalizeShippingStatus('label_created')).toBe('created')
    expect(normalizeShippingStatus('Transit')).toBe('in_transit')
    expect(formatShippingStatusLabel('available_for_pickup')).toBe(
      'Available for Pickup',
    )
  })

  it('detects refunded postage states', () => {
    expect(hasRefundedPostage('submitted')).toBe(true)
    expect(hasRefundedPostage('Refunded')).toBe(true)
    expect(hasRefundedPostage('rejected')).toBe(false)
  })

  it('prefers shipment tracking state, then explicit state, then label fallbacks', () => {
    expect(
      deriveShipmentShippingStatus({
        status: 'created',
        trackingStatus: 'delivered',
        trackingNumber: '9400',
      }),
    ).toBe('delivered')

    expect(
      deriveShipmentShippingStatus({
        status: 'out_for_delivery',
      }),
    ).toBe('out_for_delivery')

    expect(
      deriveShipmentShippingStatus({
        refundStatus: 'refunded',
        trackingStatus: 'delivered',
      }),
    ).toBe('processing')

    expect(
      deriveShipmentShippingStatus({
        trackingNumber: '9400',
      }),
    ).toBe('purchased')

    expect(
      deriveShipmentShippingStatus({
        labelUrl: null,
      }),
    ).toBe('created')
  })

  it('prefers the latest shipment over platform order status', () => {
    expect(
      deriveOrderShippingStatus({
        order: { status: 'pending' },
        latestShipment: { trackingStatus: 'in_transit' },
      }),
    ).toBe('in_transit')

    expect(
      deriveOrderShippingStatus({
        order: { shippingStatus: 'completed' },
      }),
    ).toBe('shipped')

    expect(derivePlatformShippingStatus({ shippingStatus: 'pulling' })).toBe(
      'processing',
    )
  })

  it('compares shipment timing and picks the latest shipment with updatedAt tie-breaking', () => {
    const older = { createdAt: 10, updatedAt: 20, id: 'older' }
    const newer = { createdAt: 10, updatedAt: 30, id: 'newer' }
    const newest = { createdAt: 20, updatedAt: 5, id: 'newest' }

    expect(compareShipmentTiming(older, newer)).toBeLessThan(0)
    expect(pickLatestShipment([older, newer])).toEqual(newer)
    expect(pickLatestShipment([older, newer, newest])).toEqual(newest)
    expect(pickLatestShipment([])).toBeNull()
  })
})
