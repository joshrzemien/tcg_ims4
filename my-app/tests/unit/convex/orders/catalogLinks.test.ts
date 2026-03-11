import { describe, expect, it } from 'vitest'

import {
  buildCatalogProduct,
  buildCatalogSku,
} from '../../../helpers/convexFactories'
import {
  collectBatchCatalogLookupKeys,
  enrichOrderItemsWithCatalogLinks,
  normalizeProductId,
  orderItemsNeedCatalogUpdate,
} from '../../../../convex/orders/loaders/catalogLinks'

describe('convex/orders catalog link helpers', () => {
  it('normalizes numeric product ids', () => {
    expect(normalizeProductId('1001')).toBe(1001)
    expect(normalizeProductId('')).toBeUndefined()
    expect(normalizeProductId(undefined)).toBeUndefined()
  })

  it('collects distinct catalog lookup keys across orders', () => {
    expect(
      collectBatchCatalogLookupKeys([
        {
          items: [
            { tcgplayerSku: 11, productId: '101' },
            { tcgplayerSku: 12, productId: '102' },
          ],
        },
        {
          items: [{ tcgplayerSku: 11, productId: '101' }],
        },
      ]),
    ).toEqual({
      tcgplayerSkus: [11, 12],
      tcgplayerProductIds: [101, 102],
    })
  })

  it('enriches items from sku links before falling back to product links', () => {
    const nextItems = enrichOrderItemsWithCatalogLinks(
      [
        { name: 'Matched by sku', tcgplayerSku: 11, productId: '101' },
        { name: 'Matched by product', productId: '102' },
      ],
      {
        skuMap: new Map([
          [
            11,
            buildCatalogSku({
              key: 'sku-11',
              catalogProductKey: 'product-from-sku',
              tcgplayerSku: 11,
            }),
          ],
        ]),
        productMap: new Map([
          [
            102,
            buildCatalogProduct({
              key: 'product-102',
              tcgplayerProductId: 102,
            }),
          ],
        ]),
      },
    )

    expect(nextItems).toEqual([
      expect.objectContaining({
        catalogProductKey: 'product-from-sku',
        catalogSkuKey: 'sku-11',
      }),
      expect.objectContaining({
        catalogProductKey: 'product-102',
      }),
    ])
    expect(orderItemsNeedCatalogUpdate([{},{ }], nextItems)).toBe(true)
  })
})
