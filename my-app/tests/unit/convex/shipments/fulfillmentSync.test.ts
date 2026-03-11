import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncMarketplaceFulfillmentForOrder } from '../../../../convex/shipments/workflows/fulfillmentSync'

const { markTcgplayerOrderShippedMock } = vi.hoisted(() => ({
  markTcgplayerOrderShippedMock: vi.fn(),
}))

vi.mock('../../../../convex/orders/sources/tcgplayer', () => ({
  markTcgplayerOrderShipped: markTcgplayerOrderShippedMock,
}))

describe('convex/shipments/workflows/fulfillmentSync', () => {
  beforeEach(() => {
    markTcgplayerOrderShippedMock.mockReset()
  })

  it('skips the TCGPlayer ship-no-tracking call for tracked parcel orders', async () => {
    const warning = await syncMarketplaceFulfillmentForOrder(
      {
        channel: 'tcgplayer',
        shippingMethod: 'Parcel',
        externalId: 'external-1',
        orderNumber: '1001',
      } as never,
      [],
      true,
    )

    expect(markTcgplayerOrderShippedMock).not.toHaveBeenCalled()
    expect(warning).toBe(
      'Warning: 1001 marked fulfilled locally, but TCGPlayer fulfillment sync was skipped because the order requires tracked shipping.',
    )
  })

  it('posts the TCGPlayer ship-no-tracking call for letter orders', async () => {
    markTcgplayerOrderShippedMock.mockResolvedValue(undefined)

    const warning = await syncMarketplaceFulfillmentForOrder(
      {
        channel: 'tcgplayer',
        shippingMethod: 'Letter',
        externalId: 'external-2',
        orderNumber: '1002',
      } as never,
      [],
      true,
    )

    expect(markTcgplayerOrderShippedMock).toHaveBeenCalledWith({
      orderNumber: 'external-2',
    })
    expect(warning).toBeUndefined()
  })
})
