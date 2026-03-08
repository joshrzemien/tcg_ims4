import { describe, expect, it } from 'vitest'

import {
  filterEligibleSkus,
  filterSetPayloadToSyncScope,
  isEligibleSku,
} from '../../../../convex/catalog/syncPolicy'
import type { TcgTrackingSetPayload } from '../../../../convex/catalog/sources/tcgtracking'

describe('convex/catalog/syncPolicy', () => {
  it('keeps only NM/EN skus eligible for sync', () => {
    expect(
      isEligibleSku({
        conditionCode: 'nm',
        languageCode: 'en',
      }),
    ).toBe(true)

    expect(
      filterEligibleSkus([
        { id: 'a', conditionCode: 'NM', languageCode: 'EN' },
        { id: 'b', conditionCode: 'LP', languageCode: 'EN' },
        { id: 'c', conditionCode: 'NM', languageCode: 'JP' },
      ]),
    ).toEqual([{ id: 'a', conditionCode: 'NM', languageCode: 'EN' }])
  })

  it('filters payload products, prices, and skus to the eligible sync scope', () => {
    const payload: TcgTrackingSetPayload = {
      detail: {
        set_id: 1,
        set_name: 'Alpha',
        product_count: 2,
        pricing_url: '/pricing',
        products: [
          { id: 11, name: 'Eligible', clean_name: 'eligible' },
          { id: 22, name: 'Ineligible', clean_name: 'ineligible' },
        ],
      },
      pricing: {
        set_id: 1,
        prices: {
          '11': { tcg: { Normal: { market: 1.23 } } },
          '22': { tcg: { Normal: { market: 4.56 } } },
        },
      },
      skus: {
        set_id: 1,
        sku_count: 3,
        product_count: 2,
        products: {
          '11': {
            a: { cnd: 'NM', lng: 'EN', mkt: 1.23 },
            b: { cnd: 'LP', lng: 'EN', mkt: 1.0 },
          },
          '22': {
            c: { cnd: 'NM', lng: 'JP', mkt: 5.0 },
          },
        },
      },
    }

    expect(filterSetPayloadToSyncScope(payload)).toEqual({
      detail: {
        ...payload.detail,
        product_count: 1,
        products: [{ id: 11, name: 'Eligible', clean_name: 'eligible' }],
      },
      pricing: {
        ...payload.pricing,
        prices: {
          '11': { tcg: { Normal: { market: 1.23 } } },
        },
      },
      skus: {
        ...payload.skus,
        product_count: 1,
        sku_count: 1,
        products: {
          '11': {
            a: { cnd: 'NM', lng: 'EN', mkt: 1.23 },
          },
        },
      },
    })
  })
})
