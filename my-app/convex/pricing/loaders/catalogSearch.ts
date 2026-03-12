import { v } from 'convex/values'
import { query } from '../../_generated/server'

function clampLimit(limit: number | undefined, fallback = 50, max = 200) {
  return Math.max(1, Math.min(limit ?? fallback, max))
}

function normalizeCatalogProductSearch(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function getCatalogProductSearchName(product: { cleanName: string; name: string }) {
  return product.cleanName || product.name
}

function rankCatalogProductSearchResults<
  T extends { key: string; cleanName: string; name: string },
>(results: Array<T>, normalizedSearch: string) {
  return [...results].sort((left, right) => {
    const leftName = normalizeCatalogProductSearch(
      getCatalogProductSearchName(left),
    )
    const rightName = normalizeCatalogProductSearch(
      getCatalogProductSearchName(right),
    )

    const leftExact = leftName === normalizedSearch
    const rightExact = rightName === normalizedSearch
    if (leftExact !== rightExact) {
      return leftExact ? -1 : 1
    }

    const leftPrefix = leftName.startsWith(normalizedSearch)
    const rightPrefix = rightName.startsWith(normalizedSearch)
    if (leftPrefix !== rightPrefix) {
      return leftPrefix ? -1 : 1
    }

    const leftContains = leftName.includes(normalizedSearch)
    const rightContains = rightName.includes(normalizedSearch)
    if (leftContains !== rightContains) {
      return leftContains ? -1 : 1
    }

    const lengthDelta = leftName.length - rightName.length
    if (lengthDelta !== 0) {
      return lengthDelta
    }

    return left.key.localeCompare(right.key)
  })
}

export const searchCatalogProducts = query({
  args: {
    search: v.string(),
    categoryKey: v.optional(v.string()),
    setKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { search, categoryKey, setKey, limit }) => {
    const normalizedSearch = search.trim().replace(/\s+/g, ' ')
    if (!normalizedSearch) {
      return []
    }

    const requestedLimit = clampLimit(limit, 20, 50)
    const normalizedSearchKey = normalizeCatalogProductSearch(normalizedSearch)

    const exactMatches = await ctx.db
      .query('catalogProducts')
      .withIndex('by_cleanName', (q) => q.eq('cleanName', normalizedSearch))
      .collect()

    const fuzzyMatches = await ctx.db
      .query('catalogProducts')
      .withSearchIndex('search_cleanName', (q) => {
        let searchQuery = q.search('cleanName', normalizedSearch)
        if (categoryKey) {
          searchQuery = searchQuery.eq('categoryKey', categoryKey)
        }
        if (setKey) {
          searchQuery = searchQuery.eq('setKey', setKey)
        }
        return searchQuery
      })
      .take(Math.min(Math.max(requestedLimit * 10, 100), 200))

    const filteredExactMatches = exactMatches.filter((product) => {
      if (categoryKey && product.categoryKey !== categoryKey) {
        return false
      }
      if (setKey && product.setKey !== setKey) {
        return false
      }
      return true
    })

    const mergedResults = new Map<string, (typeof fuzzyMatches)[number]>()
    for (const product of filteredExactMatches) {
      mergedResults.set(product.key, product)
    }
    for (const product of fuzzyMatches) {
      mergedResults.set(product.key, product)
    }

    return rankCatalogProductSearchResults(
      [...mergedResults.values()],
      normalizedSearchKey,
    ).slice(0, requestedLimit)
  },
})
