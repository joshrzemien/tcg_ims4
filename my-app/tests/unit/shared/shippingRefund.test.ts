import { describe, expect, it } from 'vitest'

import {
  getNonRefundableEasyPostLetterShipmentMessage,
  isNonRefundableEasyPostLetterShipment,
} from '../../../shared/shippingRefund'

describe('shared/shippingRefund', () => {
  it('identifies USPS letter shipments that EasyPost cannot refund', () => {
    expect(
      isNonRefundableEasyPostLetterShipment({
        carrier: 'USPS',
        service: 'First-Class Mail International',
      }),
    ).toBe(true)

    expect(
      isNonRefundableEasyPostLetterShipment({
        carrier: 'UPS',
        service: 'ground',
      }),
    ).toBe(false)

    expect(isNonRefundableEasyPostLetterShipment(null)).toBe(false)
  })

  it('returns the refund guidance message', () => {
    expect(getNonRefundableEasyPostLetterShipmentMessage()).toContain(
      'not eligible for refunds',
    )
  })
})
