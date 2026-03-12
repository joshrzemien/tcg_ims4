import { describe, expect, it } from 'vitest'
import { getTrackedPrintingDefinitions } from '../../../../convex/lib/printing'

describe('getTrackedPrintingDefinitions', () => {
  it('builds tracked printing definitions from product pricing', () => {
    const definitions = getTrackedPrintingDefinitions({
      tcgtrackingCategoryId: 3,
      tcgtrackingSetId: 10,
      tcgplayerPricing: {
        Normal: {
          market: 1.23,
          low: 1.01,
          high: 2.5,
        },
        Holofoil: {
          market: 3.2,
        },
      },
      manapoolPricing: {
        normal: 1.11,
      },
      manapoolQuantity: 4,
    } as never)

    expect(definitions).toEqual([
      {
        printingKey: 'normal',
        printingLabel: 'Normal',
        skuVariantCode: 'N',
        tcgMarketPriceCents: 123,
        tcgLowPriceCents: 101,
        tcgHighPriceCents: 250,
        manapoolPriceCents: 111,
        manapoolQuantity: 4,
      },
      {
        printingKey: 'holofoil',
        printingLabel: 'Holofoil',
        skuVariantCode: 'H',
        tcgMarketPriceCents: 320,
        tcgLowPriceCents: undefined,
        tcgHighPriceCents: undefined,
        manapoolPriceCents: undefined,
        manapoolQuantity: 4,
      },
    ])
  })
})
