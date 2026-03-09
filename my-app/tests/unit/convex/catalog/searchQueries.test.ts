import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  searchCategories,
  searchSets,
} from '../../../../convex/catalog/queries'

vi.mock('../../../../convex/_generated/server', () => ({
  query: (config: unknown) => config,
}))

const searchCategoriesQuery = searchCategories as unknown as {
  handler: (ctx: unknown, args: { search: string; limit?: number }) => Promise<unknown>
}
const searchSetsQuery = searchSets as unknown as {
  handler: (
    ctx: unknown,
    args: { search: string; limit?: number; categoryKey?: string },
  ) => Promise<unknown>
}

function createDbContext() {
  const take = vi.fn()
  const withSearchIndex = vi.fn((_indexName: string, buildQuery: (q: any) => unknown) => {
    const searchQuery = {
      eq: vi.fn(() => searchQuery),
    }
    const searchBuilder = {
      search: vi.fn(() => searchQuery),
    }

    buildQuery(searchBuilder)

    return {
      take,
    }
  })

  const query = vi.fn(() => ({
    withSearchIndex,
  }))

  return {
    ctx: {
      db: {
        query,
      },
    },
    query,
    withSearchIndex,
    take,
  }
}

describe('convex/catalog search queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('short-circuits category search for trimmed input below 2 characters', async () => {
    const { ctx, query } = createDbContext()

    await expect(
      searchCategoriesQuery.handler(ctx as any, { search: ' a ', limit: 25 }),
    ).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('trims category search input and clamps the result limit', async () => {
    const { ctx, withSearchIndex, take } = createDbContext()
    take.mockResolvedValue([
      {
        key: 'mtg',
        name: 'magic',
        displayName: 'Magic: The Gathering',
        tcgtrackingCategoryId: 1,
        productCount: 100,
        setCount: 5,
        updatedAt: 123,
      },
    ])

    const results = await searchCategoriesQuery.handler(ctx as any, {
      search: '  Magic   The  Gathering  ',
      limit: 999,
    })

    expect(withSearchIndex).toHaveBeenCalledWith(
      'search_displayName',
      expect.any(Function),
    )
    expect(take).toHaveBeenCalledWith(100)
    expect(results).toEqual([
      expect.objectContaining({
        key: 'mtg',
        displayName: 'Magic: The Gathering',
      }),
    ])
  })

  it('short-circuits set search for trimmed input below 2 characters', async () => {
    const { ctx, query } = createDbContext()

    await expect(
      searchSetsQuery.handler(ctx as any, {
        categoryKey: 'magic',
        search: ' x ',
        limit: 25,
      }),
    ).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('scopes set search by category when provided', async () => {
    const eq = vi.fn()
    const take = vi.fn().mockResolvedValue([
      {
        key: 'lea',
        name: 'Limited Edition Alpha',
        abbreviation: 'LEA',
        categoryKey: 'magic',
        categoryDisplayName: 'Magic: The Gathering',
        tcgtrackingSetId: 1,
        productCount: 295,
        skuCount: 300,
        publishedOn: '1993-08-05',
        syncStatus: 'ready',
        pricingSyncStatus: 'idle',
        pendingSyncMode: undefined,
        syncedProductCount: 295,
        syncedSkuCount: 300,
        updatedAt: 123,
      },
    ])

    const withSearchIndex = vi.fn((_indexName: string, buildQuery: (q: any) => unknown) => {
      const searchQuery = {
        eq: vi.fn((field: string, value: string) => {
          eq(field, value)
          return searchQuery
        }),
      }
      const searchBuilder = {
        search: vi.fn(() => searchQuery),
      }

      buildQuery(searchBuilder)

      return {
        take,
      }
    })

    const ctx = {
      db: {
        query: vi.fn(() => ({
          withSearchIndex,
        })),
      },
    }

    const results = await searchSetsQuery.handler(ctx as any, {
      categoryKey: 'magic',
      search: '  alpha ',
      limit: 25,
    })

    expect(eq).toHaveBeenCalledWith('categoryKey', 'magic')
    expect(results).toEqual([
      expect.objectContaining({
        key: 'lea',
        label: 'Magic: The Gathering / Limited Edition Alpha',
      }),
    ])
  })
})
