import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchCatalogProducts } from '../../../../convex/pricing/queries'

vi.mock('../../../../convex/_generated/server', () => ({
  internalQuery: (config: unknown) => config,
  query: (config: unknown) => config,
}))

const searchCatalogProductsQuery = searchCatalogProducts as unknown as {
  handler: (
    ctx: unknown,
    args: {
      search: string
      categoryKey?: string
      setKey?: string
      limit?: number
    },
  ) => Promise<
    Array<{
      key: string
      cleanName: string
      name: string
      categoryKey: string
      setKey: string
    }>
  >
}

describe('convex/pricing searchCatalogProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('promotes exact-name matches ahead of broader fuzzy matches', async () => {
    const collect = vi.fn().mockResolvedValue([
      {
        key: 'exact-match',
        cleanName: 'Black Lotus',
        name: 'Black Lotus',
        categoryKey: 'magic',
        setKey: 'lea',
      },
    ])
    const take = vi.fn().mockResolvedValue([
      {
        key: 'fuzzy-1',
        cleanName: 'Black Lotus Bloom',
        name: 'Black Lotus Bloom',
        categoryKey: 'magic',
        setKey: 'plc',
      },
      {
        key: 'fuzzy-2',
        cleanName: 'Lotus Blossom',
        name: 'Lotus Blossom',
        categoryKey: 'magic',
        setKey: 'mir',
      },
      {
        key: 'exact-match',
        cleanName: 'Black Lotus',
        name: 'Black Lotus',
        categoryKey: 'magic',
        setKey: 'lea',
      },
    ])

    const withIndex = vi.fn((_indexName: string, buildQuery: (q: any) => unknown) => {
      const indexQuery = {}
      const indexBuilder = {
        eq: vi.fn(() => indexQuery),
      }
      buildQuery(indexBuilder)

      return {
        collect,
      }
    })

    const withSearchIndex = vi.fn(
      (_indexName: string, buildQuery: (q: any) => unknown) => {
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
      },
    )

    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex,
          withSearchIndex,
        })),
      },
    }

    const results = await searchCatalogProductsQuery.handler(ctx as any, {
      search: '  Black   Lotus  ',
      limit: 2,
    })

    expect(collect).toHaveBeenCalledTimes(1)
    expect(take).toHaveBeenCalledWith(100)
    expect(results).toHaveLength(2)
    expect(results[0]?.key).toBe('exact-match')
    expect(results[1]?.key).toBe('fuzzy-1')
  })

  it('filters exact matches by category and set before merging', async () => {
    const collect = vi.fn().mockResolvedValue([
      {
        key: 'wrong-set',
        cleanName: 'Black Lotus',
        name: 'Black Lotus',
        categoryKey: 'magic',
        setKey: '2ed',
      },
      {
        key: 'right-set',
        cleanName: 'Black Lotus',
        name: 'Black Lotus',
        categoryKey: 'magic',
        setKey: 'lea',
      },
    ])
    const take = vi.fn().mockResolvedValue([])

    const withIndex = vi.fn((_indexName: string, buildQuery: (q: any) => unknown) => {
      const indexQuery = {}
      const indexBuilder = {
        eq: vi.fn(() => indexQuery),
      }
      buildQuery(indexBuilder)

      return {
        collect,
      }
    })

    const withSearchIndex = vi.fn(
      (_indexName: string, buildQuery: (q: any) => unknown) => {
        const eq = vi.fn(() => searchQuery)
        const searchQuery = { eq }
        const searchBuilder = {
          search: vi.fn(() => searchQuery),
        }
        buildQuery(searchBuilder)

        return {
          take,
        }
      },
    )

    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex,
          withSearchIndex,
        })),
      },
    }

    const results = await searchCatalogProductsQuery.handler(ctx as any, {
      search: 'Black Lotus',
      categoryKey: 'magic',
      setKey: 'lea',
      limit: 10,
    })

    expect(results).toEqual([
      expect.objectContaining({
        key: 'right-set',
        setKey: 'lea',
      }),
    ])
  })
})
