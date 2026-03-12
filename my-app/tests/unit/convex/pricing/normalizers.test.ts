import { describe, expect, it } from 'vitest'

import {
  buildIssueKey,
  buildSeriesKey,
  getTrackedPrintingDefinitions,
  resolveSeriesSnapshot,
} from '../../../../convex/pricing/normalizers'
import {
  buildCatalogProduct,
  buildCatalogSku,
  buildPricingTrackedSeries,
} from '../../../helpers/convexFactories'

describe('convex/pricing/normalizers', () => {
  it('builds stable series and issue keys', () => {
    expect(buildSeriesKey('product-1', 'foil')).toBe('product-1:foil')
    expect(buildIssueKey('product-1:foil', 'missing_product_price')).toBe(
      'product-1:foil:missing_product_price',
    )
  })

  it('extracts tracked printings, normalizes labels, dedupes keys, and resolves variant codes', () => {
    const definitions = getTrackedPrintingDefinitions(
      buildCatalogProduct({
        tcgtrackingCategoryId: 3,
        tcgtrackingSetId: 1663,
        tcgplayerPricing: {
          Normal: { market: 1.5, low: 1.25, high: 2.0 },
          normal: { market: 9.9 },
          'Reverse Holofoil': { market: 3.2 },
          '1st Edition Holofoil': { market: 4.2 },
        },
        manapoolPricing: {
          normal: 1.4,
          reverse_holofoil: 3.1,
          '1st_edition_holofoil': 4.0,
        },
        manapoolQuantity: 7,
      }),
    )

    expect(definitions).toEqual([
      expect.objectContaining({
        printingKey: 'normal',
        skuVariantCode: 'N',
        tcgMarketPriceCents: 150,
        manapoolPriceCents: 140,
        manapoolQuantity: 7,
      }),
      expect.objectContaining({
        printingKey: 'reverse_holofoil',
        skuVariantCode: 'RH',
        tcgMarketPriceCents: 320,
        manapoolPriceCents: 310,
      }),
      expect.objectContaining({
        printingKey: '1st_edition_holofoil',
        skuVariantCode: '1EH',
        tcgMarketPriceCents: 420,
        manapoolPriceCents: 400,
      }),
    ])
  })

  it('resolves an exact eligible sku match and produces a stable fingerprint', () => {
    const product = buildCatalogProduct({
      pricingUpdatedAt: 100,
      skuPricingUpdatedAt: 110,
      tcgplayerPricing: {
        Normal: { market: 2.25, low: 2.0, high: 2.75 },
      },
      manapoolPricing: {
        normal: 2.1,
      },
      manapoolQuantity: 5,
    })
    const series = buildPricingTrackedSeries({
      printingKey: 'normal',
      printingLabel: 'Normal',
      skuVariantCode: 'N',
    })
    const skus = [
      buildCatalogSku({
        key: 'sku-match',
        variantCode: 'N',
        tcgplayerSku: 2001,
        marketPriceCents: 210,
        lowPriceCents: 200,
        highPriceCents: 275,
        listingCount: 9,
        pricingUpdatedAt: 120,
      }),
      buildCatalogSku({
        key: 'sku-ignore',
        variantCode: 'N',
        conditionCode: 'LP',
        tcgplayerSku: 9999,
      }),
    ]

    const first = resolveSeriesSnapshot({
      series,
      product,
      skus,
      capturedAt: 130,
    })
    const second = resolveSeriesSnapshot({
      series,
      product,
      skus,
      capturedAt: 999,
    })

    expect(first).toMatchObject({
      pricingSource: 'sku',
      preferredCatalogSkuKey: 'sku-match',
      preferredTcgplayerSku: 2001,
      tcgMarketPriceCents: 210,
      manapoolPriceCents: 210,
      manapoolQuantity: 5,
      effectiveAt: 120,
      issues: [],
    })
    expect(first.snapshotFingerprint).toBe(second.snapshotFingerprint)
  })

  it('falls back to product pricing and records ambiguous sku matches', () => {
    const snapshot = resolveSeriesSnapshot({
      series: buildPricingTrackedSeries({
        printingKey: 'normal',
        printingLabel: 'Normal',
        skuVariantCode: 'N',
      }),
      product: buildCatalogProduct({
        pricingUpdatedAt: 100,
        tcgplayerPricing: {
          Normal: { market: 4.5, low: 4.25, high: 5.0 },
        },
      }),
      skus: [
        buildCatalogSku({
          key: 'sku-a',
          variantCode: 'N',
          tcgplayerSku: 101,
        }),
        buildCatalogSku({
          key: 'sku-b',
          variantCode: 'N',
          tcgplayerSku: 202,
        }),
      ],
      capturedAt: 150,
    })

    expect(snapshot).toMatchObject({
      pricingSource: 'product_fallback',
      tcgMarketPriceCents: 450,
      tcgLowPriceCents: 425,
      tcgHighPriceCents: 500,
      effectiveAt: 100,
    })
    expect(snapshot.issues).toContainEqual({
      issueType: 'ambiguous_nm_en_sku',
      details: {
        printingKey: 'normal',
        printingLabel: 'Normal',
        skuVariantCode: 'N',
        tcgplayerSkus: [101, 202],
      },
    })
  })

  it('reports unmapped printings and missing Manapool matches during product fallback', () => {
    const snapshot = resolveSeriesSnapshot({
      series: buildPricingTrackedSeries({
        printingKey: 'etched',
        printingLabel: 'Etched',
      }),
      product: buildCatalogProduct({
        pricingUpdatedAt: 100,
        tcgplayerPricing: {
          Etched: { market: 7.0 },
        },
        manapoolPricing: {
          foil: 6.5,
        },
      }),
      skus: [],
      capturedAt: 200,
    })

    expect(snapshot.pricingSource).toBe('product_fallback')
    expect(snapshot.tcgMarketPriceCents).toBe(700)
    expect(snapshot.issues).toEqual(
      expect.arrayContaining([
        {
          issueType: 'unmapped_printing',
          details: {
            printingKey: 'etched',
            printingLabel: 'Etched',
          },
        },
        {
          issueType: 'missing_manapool_match',
          details: {
            printingKey: 'etched',
            printingLabel: 'Etched',
            availableManapoolKeys: ['foil'],
          },
        },
      ]),
    )
  })

  it('returns unavailable snapshots when product pricing is missing', () => {
    const snapshot = resolveSeriesSnapshot({
      series: buildPricingTrackedSeries({
        printingKey: 'normal',
        printingLabel: 'Normal',
        skuVariantCode: 'N',
      }),
      product: buildCatalogProduct({
        pricingUpdatedAt: 100,
        skuPricingUpdatedAt: 80,
        tcgplayerPricing: {
          Normal: {},
        },
        manapoolPricing: {
          foil: 1.2,
        },
      }),
      skus: [],
      capturedAt: 150,
    })

    expect(snapshot).toMatchObject({
      pricingSource: 'unavailable',
      effectiveAt: 100,
      sourcePricingUpdatedAt: 100,
      sourceSkuPricingUpdatedAt: 80,
    })
    expect(snapshot.issues).toEqual(
      expect.arrayContaining([
        {
          issueType: 'missing_manapool_match',
          details: {
            printingKey: 'normal',
            printingLabel: 'Normal',
            availableManapoolKeys: ['foil'],
          },
        },
        {
          issueType: 'missing_product_price',
          details: {
            printingKey: 'normal',
            printingLabel: 'Normal',
          },
        },
      ]),
    )
  })
})
