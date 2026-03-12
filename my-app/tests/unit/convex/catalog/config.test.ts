import { describe, expect, it } from 'vitest'

import {
  filterAllowedCatalogCategories,
  getAllowedCatalogCategoryIds,
  isCatalogCategoryAllowed,
} from '../../../../convex/catalog/config'

describe('convex/catalog/config', () => {
  it('returns null when no category filter is configured', () => {
    delete process.env.CATALOG_ALLOWED_CATEGORY_IDS

    expect(getAllowedCatalogCategoryIds()).toBeNull()
    expect(isCatalogCategoryAllowed(42)).toBe(true)
  })

  it('parses category ids, ignores invalid values, and collapses duplicates', () => {
    process.env.CATALOG_ALLOWED_CATEGORY_IDS = '1, 2, nope, 2, -3, 4'

    expect([...getAllowedCatalogCategoryIds()!]).toEqual([1, 2, 4])
    expect(isCatalogCategoryAllowed(2)).toBe(true)
    expect(isCatalogCategoryAllowed(9)).toBe(false)
  })

  it('filters categories using the configured allow-list', () => {
    process.env.CATALOG_ALLOWED_CATEGORY_IDS = '2,4'

    expect(
      filterAllowedCatalogCategories([
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
        { id: 4, name: 'four' },
      ]),
    ).toEqual([
      { id: 2, name: 'two' },
      { id: 4, name: 'four' },
    ])
  })
})
