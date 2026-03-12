import { describe, expect, it } from 'vitest'
import {
  canRefundShipment,
  extractAddress,
  formatAddress,
  formatRateLabel,
  formatRefundStatus,
  parseWeightOz,
  shipmentHasPurchasedLabel,
} from '../../../../../src/features/postage/lib/shipment'

describe('postage helper logic', () => {
  it('parses and rounds ounces while rejecting invalid values', () => {
    expect(parseWeightOz('1.236')).toBe(1.24)
    expect(() => parseWeightOz('0')).toThrow('Enter a valid weight in ounces.')
    expect(() => parseWeightOz('abc')).toThrow('Enter a valid weight in ounces.')
  })

  it('extracts and formats standalone shipment addresses', () => {
    const shipment = {
      toAddress: {
        name: 'Jane Doe',
        street1: '123 Main',
        street2: 'Apt 4',
        city: 'Detroit',
        state: 'MI',
        zip: '48201',
        country: 'US',
      },
    } as never

    expect(extractAddress(shipment)).toEqual({
      name: 'Jane Doe',
      street1: '123 Main',
      street2: 'Apt 4',
      city: 'Detroit',
      state: 'MI',
      zip: '48201',
      country: 'US',
    })
    expect(formatAddress(shipment)).toBe('123 Main · Apt 4 · Detroit, MI 48201 · US')
  })

  it('formats postage rates and refund statuses', () => {
    expect(
      formatRateLabel({
        carrier: 'USPS',
        service: 'Ground Advantage',
        rateCents: 499,
        deliveryDays: 3,
      } as never),
    ).toBe('USPS Ground Advantage · $4.99, 3d')
    expect(formatRefundStatus()).toBe('Not requested')
    expect(formatRefundStatus('submitted_for_review')).toBe('submitted for review')
  })

  it('detects purchased labels and refundable standalone shipments', () => {
    expect(
      shipmentHasPurchasedLabel({
        trackingNumber: '9400',
      } as never),
    ).toBe(true)

    expect(
      canRefundShipment({
        trackingNumber: '9400',
        labelUrl: 'https://label.test',
        refundStatus: undefined,
        status: 'unknown',
        carrier: 'USPS',
        service: 'Ground Advantage',
      } as never),
    ).toBe(true)

    expect(
      canRefundShipment({
        trackingNumber: '9400',
        labelUrl: 'https://label.test',
        refundStatus: 'submitted',
        status: 'unknown',
        carrier: 'USPS',
        service: 'Ground Advantage',
      } as never),
    ).toBe(false)

    expect(
      canRefundShipment({
        trackingNumber: '9400',
        labelUrl: 'https://label.test',
        refundStatus: undefined,
        status: 'delivered',
        carrier: 'USPS',
        service: 'Ground Advantage',
      } as never),
    ).toBe(false)
  })
})
