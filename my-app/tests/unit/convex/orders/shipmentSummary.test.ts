import { describe, expect, it } from 'vitest'

import {
  buildOrderShipmentState,
  materializedOrderShipmentStateEquals,
  readMaterializedOrderShipmentState,
} from '../../../../convex/orders/shipmentSummary'
import { buildShipment } from '../../../helpers/convexFactories'

describe('convex/orders/shipmentSummary', () => {
  it('prefers the latest purchased non-refunded shipment as active and counts review shipments', () => {
    const reviewCandidate = buildShipment({
      _id: 'review',
      easypostShipmentId: 'shp_review',
      trackingNumber: '9400-review',
      status: 'created',
      createdAt: 10,
      updatedAt: 10,
    })
    const active = buildShipment({
      _id: 'active',
      easypostShipmentId: 'shp_active',
      trackingNumber: '9400-active',
      carrier: 'usps',
      service: 'ground_advantage',
      trackerPublicUrl: '   ',
      status: 'unknown',
      createdAt: 20,
      updatedAt: 20,
    })
    const refundedLatest = buildShipment({
      _id: 'latest',
      easypostShipmentId: 'shp_latest',
      trackingNumber: '9400-latest',
      refundStatus: 'refunded',
      trackerPublicUrl: 'https://track.example/latest',
      status: 'created',
      createdAt: 30,
      updatedAt: 30,
    })
    const tracked = buildShipment({
      _id: 'tracked',
      easypostShipmentId: 'shp_tracked',
      trackingNumber: '9400-tracked',
      trackingStatus: 'in_transit',
      status: 'in_transit',
      createdAt: 15,
      updatedAt: 15,
    })

    const state = buildOrderShipmentState({
      order: {
        channel: 'tcgplayer',
        shippingMethod: 'standard',
        status: 'pending',
        items: [{ quantity: 1, productType: 'mtg_single' }],
      },
      shipments: [reviewCandidate, active, refundedLatest, tracked],
    })

    expect(state).toMatchObject({
      shippingMethod: 'Parcel',
      shippingStatus: 'purchased',
      shipmentCount: 4,
      reviewShipmentCount: 1,
      trackingPublicUrl: undefined,
      activeShipment: {
        _id: active._id,
        easypostShipmentId: 'shp_active',
      },
      latestShipment: {
        _id: refundedLatest._id,
        easypostShipmentId: 'shp_latest',
      },
    })
  })

  it('reads and compares materialized shipment state payloads', () => {
    const order = {
      shippingMethod: 'Letter',
      shippingStatus: 'delivered',
      shipmentCount: 1,
      reviewShipmentCount: 0,
      trackingPublicUrl: 'https://track.example/1',
      activeShipment: {
        _id: 'ship_1' as never,
        easypostShipmentId: 'shp_1',
        status: 'delivered' as const,
        trackingNumber: '9400',
        createdAt: 10,
        updatedAt: 20,
      },
      latestShipment: {
        _id: 'ship_1' as never,
        easypostShipmentId: 'shp_1',
        status: 'delivered' as const,
        trackingNumber: '9400',
        createdAt: 10,
        updatedAt: 20,
      },
    }

    const state = readMaterializedOrderShipmentState(order)

    expect(state).toEqual({
      ...order,
      activeShipment: order.activeShipment,
      latestShipment: order.latestShipment,
    })
    expect(materializedOrderShipmentStateEquals(order, state)).toBe(true)
    expect(
      materializedOrderShipmentStateEquals(order, {
        ...state,
        reviewShipmentCount: 1,
      }),
    ).toBe(false)
  })
})
