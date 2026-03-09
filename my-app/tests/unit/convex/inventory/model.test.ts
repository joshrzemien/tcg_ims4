import { describe, expect, it } from 'vitest'
import {
  buildCatalogProduct,
  buildCatalogSet,
  buildCatalogSku,
  buildInventoryLocation,
  buildInventoryLocationContent,
  buildInventoryUnitDetail,
  buildPricingTrackedSeries,
} from '../../../helpers/convexFactories'
import {
  buildCatalogContentIdentityKey,
  buildEmptyWorkflowBreakdown,
  buildGradedContentIdentityKey,
  buildInventoryAggregateRow,
  buildInventoryContentRow,
  buildInventoryExtendedPriceCents,
  buildPendingGradedContentIdentityKey,
  buildTcgplayerProductUrl,
  buildUnitIdentityKey,
  normalizeInventoryQuantity,
  normalizeLocationCode,
  parseLocationCode,
  resolveInventoryPriceCents,
  buildInventoryPriceSummary,
} from '../../../../convex/inventory/model'

describe('normalizeLocationCode', () => {
  it('uppercases and preserves colon-delimited segments', () => {
    expect(normalizeLocationCode('01:aa:bb_1')).toBe('01:AA:BB_1')
  })

  it('rejects empty segments', () => {
    expect(() => normalizeLocationCode('01::02')).toThrow(
      'Location code must use non-empty colon-delimited segments',
    )
  })
})

describe('parseLocationCode', () => {
  it('returns normalized code, path segments, and depth', () => {
    expect(parseLocationCode('01:01:01')).toEqual({
      code: '01:01:01',
      pathSegments: ['01', '01', '01'],
      depth: 3,
    })
  })
})

describe('identity helpers', () => {
  it('builds a stable catalog content identity key', () => {
    expect(
      buildCatalogContentIdentityKey({
        locationId: 'location-1' as never,
        inventoryClass: 'single',
        catalogProductKey: 'product-1',
        catalogSkuKey: 'sku-1',
      }),
    ).toBe('catalog|location-1|single|product-1|sku-1')
  })

  it('builds graded identity keys from unit details', () => {
    const unitIdentityKey = buildUnitIdentityKey({
      gradingCompany: 'psa',
      certNumber: '12345',
    })

    expect(unitIdentityKey).toBe('PSA|12345')
    expect(buildGradedContentIdentityKey({
      locationId: 'location-1' as never,
      unitIdentityKey,
    })).toBe('graded|location-1|PSA|12345')
    expect(buildPendingGradedContentIdentityKey('content-1' as never)).toBe(
      'graded|pending|content-1',
    )
  })
})

describe('normalizeInventoryQuantity', () => {
  it('accepts non-negative integers', () => {
    expect(normalizeInventoryQuantity(0)).toBe(0)
    expect(normalizeInventoryQuantity(3)).toBe(3)
  })

  it('rejects negative or fractional quantities', () => {
    expect(() => normalizeInventoryQuantity(-1)).toThrow(
      'Inventory quantity must be a non-negative integer',
    )
    expect(() => normalizeInventoryQuantity(1.5)).toThrow(
      'Inventory quantity must be a non-negative integer',
    )
  })
})

describe('pricing helpers', () => {
  it('prefers tracked series that match the selected sku', () => {
    const product = buildCatalogProduct()
    const sku = buildCatalogSku({ key: 'sku-normal', variantCode: 'N' })
    const summary = buildInventoryPriceSummary({
      product,
      sku,
      trackedSeries: [
        buildPricingTrackedSeries({
          key: 'product-1:foil',
          printingKey: 'foil',
          printingLabel: 'Foil',
          skuVariantCode: 'F',
          preferredCatalogSkuKey: 'sku-foil',
          currentTcgMarketPriceCents: 2_500,
        }),
        buildPricingTrackedSeries({
          key: 'product-1:normal',
          printingKey: 'normal',
          printingLabel: 'Normal',
          skuVariantCode: 'N',
          preferredCatalogSkuKey: 'sku-normal',
          currentTcgMarketPriceCents: 1_500,
        }),
      ],
    })

    expect(summary.source).toBe('tracked_series')
    expect(summary.selected?.seriesKey).toBe('product-1:normal')
    expect(summary.selected?.tcgMarketPriceCents).toBe(1_500)
  })

  it('falls back to sku pricing when no product pricing exists', () => {
    const summary = buildInventoryPriceSummary({
      product: buildCatalogProduct(),
      sku: buildCatalogSku({
        marketPriceCents: 900,
        lowPriceCents: 800,
        highPriceCents: 1_200,
      }),
      trackedSeries: [],
    })

    expect(resolveInventoryPriceCents(summary, 'market')).toBe(900)
    expect(resolveInventoryPriceCents(summary, 'low')).toBe(800)
    expect(resolveInventoryPriceCents(summary, 'high')).toBe(1_200)
  })

  it('multiplies prices by quantity', () => {
    expect(buildInventoryExtendedPriceCents(1_234, 3)).toBe(3_702)
    expect(buildInventoryExtendedPriceCents(undefined, 3)).toBeUndefined()
  })

  it('builds tcgplayer product URLs from product ids', () => {
    expect(buildTcgplayerProductUrl(1000)).toBe(
      'https://www.tcgplayer.com/product/1000',
    )
  })
})

describe('buildInventoryContentRow', () => {
  it('returns a hydrated location-first row with pricing and graded detail', () => {
    const row = buildInventoryContentRow({
      content: buildInventoryLocationContent({
        inventoryClass: 'graded',
        quantity: 1,
        workflowStatus: 'hold',
      }),
      location: buildInventoryLocation({
        code: '01:01:01:01:01:01',
      }),
      product: buildCatalogProduct({
        tcgplayerPricing: {
          Normal: {
            market: 10,
            low: 8,
            high: 12,
          },
        },
      }),
      sku: buildCatalogSku(),
      set: buildCatalogSet(),
      trackedSeries: [],
      unitDetail: buildInventoryUnitDetail(),
    })

    expect(row.location.code).toBe('01:01:01:01:01:01')
    expect(row.workflowStatus).toBe('hold')
    expect(row.unitDetail?.certNumber).toBe('12345')
    expect(row.price.totalMarketPriceCents).toBe(1_000)
  })
})

describe('buildInventoryAggregateRow', () => {
  it('returns aggregate stock rows with workflow and location rollups', () => {
    const row = buildInventoryAggregateRow({
      aggregate: {
        aggregateKey: 'single|product-1|sku-1',
        inventoryClass: 'single',
        catalogProductKey: 'product-1',
        catalogSkuKey: 'sku-1',
        totalQuantity: 4,
        distinctLocationIds: new Set(['loc-1' as never, 'loc-2' as never]),
        workflowBreakdown: {
          ...buildEmptyWorkflowBreakdown(),
          available: 3,
          processing: 1,
        },
        latestUpdatedAt: 42,
        locationCodes: new Set(['01:01', '01:02']),
      },
      product: buildCatalogProduct({
        tcgplayerPricing: {
          Normal: {
            market: 2.5,
            low: 2,
            high: 3,
          },
        },
      }),
      sku: buildCatalogSku(),
      set: buildCatalogSet(),
      trackedSeries: [],
    })

    expect(row.totalQuantity).toBe(4)
    expect(row.distinctLocationCount).toBe(2)
    expect(row.workflowBreakdown.processing).toBe(1)
    expect(row.price.totalMarketPriceCents).toBe(1_000)
  })
})
