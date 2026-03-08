import { describe, expect, it } from 'vitest'
import {
  buildCatalogProduct,
  buildCatalogSet,
  buildCatalogSku,
  buildInventoryItem,
  buildPricingTrackedSeries,
} from '../../../helpers/convexFactories'
import {
  buildInventoryExtendedPriceCents,
  buildInventoryListRow,
  buildInventoryPriceSummary,
  buildTcgplayerProductUrl,
  normalizeInventoryMetadataFields,
  normalizeInventoryQuantity,
  resolveInventoryPriceCents,
} from '../../../../convex/inventory/model'

describe('normalizeInventoryMetadataFields', () => {
  it('trims fields and drops empty entries', () => {
    expect(
      normalizeInventoryMetadataFields([
        { key: ' location ', value: ' Case A ' },
        { key: ' ', value: 'ignored' },
        { key: 'note', value: ' ' },
      ]),
    ).toEqual([{ key: 'location', value: 'Case A' }])
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

describe('buildInventoryPriceSummary', () => {
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

  it('falls back to product pricing definitions when no tracked series exists', () => {
    const product = buildCatalogProduct({
      tcgplayerPricing: {
        Normal: {
          market: 12.34,
          low: 10.01,
          high: 15.67,
        },
      },
      manapoolPricing: {
        normal: 11.11,
      },
      manapoolQuantity: 4,
      pricingUpdatedAt: 123,
    })

    const summary = buildInventoryPriceSummary({
      product,
      trackedSeries: [],
    })

    expect(summary.source).toBe('product')
    expect(summary.selected).toMatchObject({
      printingKey: 'normal',
      tcgMarketPriceCents: 1_234,
      tcgLowPriceCents: 1_001,
      tcgHighPriceCents: 1_567,
      manapoolPriceCents: 1_111,
      manapoolQuantity: 4,
      pricingUpdatedAt: 123,
    })
  })

  it('falls back to raw sku pricing when only sku pricing exists', () => {
    const product = buildCatalogProduct()
    const sku = buildCatalogSku({
      marketPriceCents: 900,
      lowPriceCents: 800,
      highPriceCents: 1_200,
      listingCount: 7,
      pricingUpdatedAt: 456,
    })

    const summary = buildInventoryPriceSummary({
      product,
      sku,
      trackedSeries: [],
    })

    expect(summary.source).toBe('sku')
    expect(summary.selected).toBeNull()
    expect(summary.skuPricing).toEqual({
      marketPriceCents: 900,
      lowPriceCents: 800,
      highPriceCents: 1_200,
      listingCount: 7,
      pricingUpdatedAt: 456,
    })
  })
})

describe('resolveInventoryPriceCents', () => {
  it('prefers tracked or product-selected prices when present', () => {
    const summary = buildInventoryPriceSummary({
      product: buildCatalogProduct({
        tcgplayerPricing: {
          Normal: {
            market: 12.34,
            low: 10.01,
            high: 15.67,
          },
        },
      }),
      trackedSeries: [],
    })

    expect(resolveInventoryPriceCents(summary, 'market')).toBe(1_234)
    expect(resolveInventoryPriceCents(summary, 'low')).toBe(1_001)
    expect(resolveInventoryPriceCents(summary, 'high')).toBe(1_567)
  })

  it('falls back to sku prices when no selected series or product price exists', () => {
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
})

describe('buildInventoryExtendedPriceCents', () => {
  it('multiplies unit price by quantity when priced', () => {
    expect(buildInventoryExtendedPriceCents(1_234, 3)).toBe(3_702)
  })

  it('returns undefined when the unit price is unavailable', () => {
    expect(buildInventoryExtendedPriceCents(undefined, 3)).toBeUndefined()
  })
})

describe('buildTcgplayerProductUrl', () => {
  it('builds a direct product link from the TCGplayer product id', () => {
    expect(buildTcgplayerProductUrl(1000)).toBe(
      'https://www.tcgplayer.com/product/1000',
    )
  })

  it('returns undefined when the product id is unavailable', () => {
    expect(buildTcgplayerProductUrl(undefined)).toBeUndefined()
  })
})

describe('buildInventoryListRow', () => {
  it('includes product URL and resolved extended prices', () => {
    const row = buildInventoryListRow({
      item: buildInventoryItem({
        inventoryType: 'sealed',
        catalogSkuKey: undefined,
        quantity: 2,
        location: 'Shelf A',
      }),
      product: buildCatalogProduct({
        cleanName: 'Black Lotus',
        tcgplayerUrl: 'https://www.tcgplayer.com/product/1000',
        tcgplayerPricing: {
          Normal: {
            market: 100,
            low: 90,
          },
        },
      }),
      sku: null,
      set: buildCatalogSet(),
      trackedSeries: [],
    })

    expect(row.product.tcgplayerUrl).toBe(
      'https://www.tcgplayer.com/product/1000',
    )
    expect(row.price.resolvedMarketPriceCents).toBe(10_000)
    expect(row.price.totalMarketPriceCents).toBe(20_000)
    expect(row.price.resolvedLowPriceCents).toBe(9_000)
    expect(row.price.totalLowPriceCents).toBe(18_000)
  })

  it('falls back to a direct TCGplayer product link when no source URL is stored', () => {
    const row = buildInventoryListRow({
      item: buildInventoryItem(),
      product: buildCatalogProduct({
        tcgplayerProductId: 4321,
        tcgplayerUrl: undefined,
      }),
      sku: buildCatalogSku(),
      set: buildCatalogSet(),
      trackedSeries: [],
    })

    expect(row.product.tcgplayerUrl).toBe(
      'https://www.tcgplayer.com/product/4321',
    )
  })
})
