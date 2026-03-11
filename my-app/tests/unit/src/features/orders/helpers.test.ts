import { describe, expect, it } from 'vitest'
import { decodeBase64Document, normalizeBase64DocumentData } from '../../../../../src/features/orders/lib/documents'
import {
  canRefundShipment,
  canRepurchaseShipment,
  formatOrderItemMeta,
  formatRefundStatus,
  shipmentReviewLabel,
} from '../../../../../src/features/orders/lib/shipment'

describe('orders helper logic', () => {
  it('normalizes data urls and preserves mime type for document exports', async () => {
    const normalized = normalizeBase64DocumentData('data:text/plain;base64, SGVsbG8')

    expect(normalized).toEqual({
      normalizedBase64Data: 'SGVsbG8=',
      mimeType: 'text/plain',
    })

    const blob = decodeBase64Document('SGVsbG8=', 'application/octet-stream')
    expect(await blob.text()).toBe('Hello')
    expect(blob.type).toBe('application/octet-stream')
  })

  it('rejects invalid base64 document payloads', () => {
    expect(() => normalizeBase64DocumentData('abc*')).toThrow(
      'TCGplayer returned a document in an unexpected format.',
    )
  })

  it('only allows refunds for purchased untracked refundable labels', () => {
    expect(
      canRefundShipment({
        trackingNumber: '9400',
        labelUrl: 'https://label.test',
        refundStatus: undefined,
        trackingStatus: undefined,
        carrier: 'USPS',
        service: 'Ground Advantage',
      }),
    ).toBe(true)

    expect(
      canRefundShipment({
        trackingNumber: '9400',
        labelUrl: 'https://label.test',
        refundStatus: 'submitted',
        trackingStatus: undefined,
        carrier: 'USPS',
        service: 'Ground Advantage',
      }),
    ).toBe(false)

    expect(
      canRefundShipment({
        trackingNumber: '9400',
        labelUrl: 'https://label.test',
        refundStatus: undefined,
        trackingStatus: 'in_transit',
        carrier: 'USPS',
        service: 'Ground Advantage',
      }),
    ).toBe(false)
  })

  it('locks repurchase until the active label has been refunded', () => {
    expect(canRepurchaseShipment(undefined)).toBe(true)
    expect(canRepurchaseShipment({ refundStatus: 'submitted' } as never)).toBe(true)
    expect(canRepurchaseShipment({ refundStatus: undefined } as never)).toBe(false)
  })

  it('classifies shipment review labels and formats item meta/status text', () => {
    expect(
      shipmentReviewLabel(
        {
          _id: 'shipment-1' as never,
          refundStatus: undefined,
          trackingStatus: 'unknown',
          status: 'unknown',
        },
        'shipment-1' as never,
      ),
    ).toBe('Active')

    expect(
      shipmentReviewLabel({
        _id: 'shipment-2' as never,
        refundStatus: 'submitted',
        trackingStatus: 'unknown',
        status: 'unknown',
      }),
    ).toBe('Refunded')

    expect(
      shipmentReviewLabel({
        _id: 'shipment-3' as never,
        refundStatus: undefined,
        trackingStatus: 'delivered',
        status: 'delivered',
      }),
    ).toBe('Delivered')

    expect(
      shipmentReviewLabel({
        _id: 'shipment-4' as never,
        refundStatus: undefined,
        trackingStatus: 'in_transit',
        status: 'in_transit',
      }),
    ).toBe('Tracked')

    expect(formatRefundStatus()).toBe('Not requested')
    expect(formatRefundStatus('refund_requested')).toBe('refund requested')
    expect(
      formatOrderItemMeta({
        set: 'Alpha',
        collectorNumber: '1',
        conditionId: 'Near Mint',
        finishId: 'Foil',
        languageId: 'English',
      }),
    ).toBe('Alpha · #1 · Near Mint · Foil · English')
  })
})
