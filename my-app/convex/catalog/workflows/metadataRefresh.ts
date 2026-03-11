import { internal } from '../../_generated/api'
import { action, internalAction } from '../../_generated/server'
import { chunkArray } from '../../lib/collections'
import { filterAllowedCatalogCategories } from '../config'
import { mapCategory, mapSet } from '../shared/mappers'
import {
  fetchCatalogCategories,
  fetchCatalogMeta,
  fetchCatalogSets,
} from '../sources/tcgtracking'
import type { ActionCtx } from '../../_generated/server'

type MetadataRefreshResult = {
  categories: number
  sets: number
  meta: Awaited<ReturnType<typeof fetchCatalogMeta>>
}

export async function refreshCatalogMetadata(
  ctx: ActionCtx,
): Promise<MetadataRefreshResult> {
  const [meta, allCategories] = await Promise.all([
    fetchCatalogMeta(),
    fetchCatalogCategories(),
  ])
  const categories = filterAllowedCatalogCategories(allCategories)

  await ctx.runMutation(internal.catalog.mutations.upsertCategoriesBatch, {
    categories: categories.map(mapCategory),
  })

  let totalSets = 0

  for (const category of categories) {
    const sets = await fetchCatalogSets(category.id)
    totalSets += sets.length

    for (const batch of chunkArray(
      sets.map((set) => mapSet(category, set)),
      100,
    )) {
      await ctx.runMutation(internal.catalog.mutations.upsertSetsBatch, {
        sets: batch,
      })
    }
  }

  return {
    categories: categories.length,
    sets: totalSets,
    meta,
  }
}

export const refreshMetadata = internalAction({
  args: {},
  handler: async (ctx): Promise<MetadataRefreshResult> => {
    return await refreshCatalogMetadata(ctx)
  },
})

export const refreshMetadataNow = action({
  args: {},
  handler: async (ctx): Promise<MetadataRefreshResult> => {
    return await refreshCatalogMetadata(ctx)
  },
})
