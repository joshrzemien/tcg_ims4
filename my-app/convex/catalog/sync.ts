import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { action, internalAction } from '../_generated/server'
import { dollarsToCents } from '../orders/mappers/shared'
import {
  fetchCatalogCategories,
  fetchCatalogMeta,
  fetchCatalogSetPayload,
  fetchCatalogSets,
} from './sources/tcgtracking'
import { filterAllowedCatalogCategories } from './config'
import type { ActionCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'

const DEFAULT_SYNC_WINDOW = 5
const PRODUCT_BATCH_SIZE = 100
const SKU_BATCH_SIZE = 500
const CLEANUP_PRODUCT_BATCH_SIZE = 250
const CLEANUP_SKU_BATCH_SIZE = 1000
const STUCK_SYNC_THRESHOLD_MS = 30 * 60 * 1000

type SyncSetSuccess = {
  setKey: string
  productCount: number
  skuCount: number
  cleanup: { deletedProducts: number; deletedSkus: number }
  completedAt: number
}

type MetadataRefreshResult = {
  categories: number
  sets: number
  meta: Awaited<ReturnType<typeof fetchCatalogMeta>>
}

type CatalogWindowResult = {
  attempted: number
  scheduled: number
  metadataRefreshed: boolean
  queuedSetKeys: Array<string>
}

function chunk<T>(items: Array<T>, size: number): Array<Array<T>> {
  const chunks: Array<Array<T>> = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeOptionalStringArray(value: unknown): Array<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim() !== '',
  )

  return items.length > 0 ? items : undefined
}

function normalizeOptionalRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return Object.keys(value as Record<string, unknown>).length > 0
    ? (value as Record<string, unknown>)
    : undefined
}

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function buildCategoryKey(categoryId: number) {
  return `tcgtracking:category:${categoryId}`
}

function buildSetKey(categoryId: number, setId: number) {
  return `tcgtracking:set:${categoryId}:${setId}`
}

function buildProductKey(categoryId: number, setId: number, productId: number) {
  return `tcgtracking:product:${categoryId}:${setId}:${productId}`
}

function buildSkuKey(
  categoryId: number,
  setId: number,
  productId: number,
  skuId: number,
) {
  return `tcgtracking:sku:${categoryId}:${setId}:${productId}:${skuId}`
}

function mapCategory(category: {
  id: number
  name: string
  display_name: string
  product_count: number
  set_count: number
  api_url: string
}) {
  return {
    key: buildCategoryKey(category.id),
    tcgtrackingCategoryId: category.id,
    name: category.name,
    displayName: category.display_name,
    productCount: category.product_count,
    setCount: category.set_count,
    apiUrl: category.api_url,
    updatedAt: Date.now(),
  }
}

function mapSet(
  category: { id: number; name: string; display_name: string },
  set: {
    id: number
    name: string
    abbreviation?: string | null
    is_supplemental?: boolean | null
    published_on?: string | null
    modified_on?: string | null
    product_count: number
    sku_count: number
    products_modified?: string | null
    pricing_modified?: string | null
    skus_modified?: string | null
  },
) {
  return {
    key: buildSetKey(category.id, set.id),
    categoryKey: buildCategoryKey(category.id),
    tcgtrackingCategoryId: category.id,
    categoryName: category.name,
    categoryDisplayName: category.display_name,
    tcgtrackingSetId: set.id,
    name: set.name,
    abbreviation: normalizeOptionalString(set.abbreviation),
    isSupplemental:
      typeof set.is_supplemental === 'boolean' ? set.is_supplemental : undefined,
    publishedOn: normalizeOptionalString(set.published_on),
    modifiedOn: normalizeOptionalString(set.modified_on),
    productCount: set.product_count,
    skuCount: set.sku_count,
    productsModifiedAt: normalizeOptionalString(set.products_modified),
    pricingModifiedAt: normalizeOptionalString(set.pricing_modified),
    skusModifiedAt: normalizeOptionalString(set.skus_modified),
    updatedAt: Date.now(),
  }
}

function mapProducts(
  set: Doc<'catalogSets'>,
  payload: Awaited<ReturnType<typeof fetchCatalogSetPayload>>,
) {
  const pricingUpdatedAt = toTimestamp(normalizeOptionalString(payload.pricing.updated))
  const skuPricingUpdatedAt = toTimestamp(normalizeOptionalString(payload.skus.updated))
  const sourceDataModifiedAt = toTimestamp(
    normalizeOptionalString(payload.detail.data_modified),
  )

  return payload.detail.products.map((product) => {
    const productPricing = payload.pricing.prices[String(product.id)] ?? {}

    return {
      key: buildProductKey(
        set.tcgtrackingCategoryId,
        set.tcgtrackingSetId,
        product.id,
      ),
      categoryKey: set.categoryKey,
      setKey: set.key,
      tcgtrackingCategoryId: set.tcgtrackingCategoryId,
      tcgtrackingSetId: set.tcgtrackingSetId,
      tcgplayerProductId: product.id,
      name: product.name,
      cleanName: product.clean_name,
      number: normalizeOptionalString(product.number),
      rarity: normalizeOptionalString(product.rarity),
      imageUrl: normalizeOptionalString(product.image_url),
      imageCount: normalizeOptionalNumber(product.image_count),
      tcgplayerUrl: normalizeOptionalString(product.tcgplayer_url),
      manapoolUrl: normalizeOptionalString(product.manapool_url),
      scryfallId: normalizeOptionalString(product.scryfall_id),
      mtgjsonUuid: normalizeOptionalString(product.mtgjson_uuid),
      cardmarketId: normalizeOptionalNumber(product.cardmarket_id),
      cardtraderId: normalizeOptionalNumber(product.cardtrader_id),
      cardtrader: product.cardtrader ?? undefined,
      colors: normalizeOptionalStringArray(product.colors),
      colorIdentity: normalizeOptionalStringArray(product.color_identity),
      manaValue: normalizeOptionalNumber(product.mana_value),
      finishes: normalizeOptionalStringArray(product.finishes),
      borderColor: normalizeOptionalString(product.border_color),
      tcgplayerPricing: normalizeOptionalRecord(productPricing.tcg),
      manapoolPricing: normalizeOptionalRecord(productPricing.manapool),
      manapoolQuantity: normalizeOptionalNumber(productPricing.mp_qty),
      sourceDataModifiedAt,
      pricingUpdatedAt,
      skuPricingUpdatedAt,
    }
  })
}

function mapSkus(
  set: Doc<'catalogSets'>,
  payload: Awaited<ReturnType<typeof fetchCatalogSetPayload>>,
) {
  const pricingUpdatedAt = toTimestamp(normalizeOptionalString(payload.skus.updated))
  const skus: Array<Record<string, unknown>> = []

  for (const [productId, productSkus] of Object.entries(payload.skus.products)) {
    const tcgplayerProductId = Number(productId)
    if (!Number.isFinite(tcgplayerProductId)) {
      continue
    }

    for (const [skuId, sku] of Object.entries(productSkus)) {
      const tcgplayerSku = Number(skuId)
      if (!Number.isFinite(tcgplayerSku)) {
        continue
      }

      skus.push({
        key: buildSkuKey(
          set.tcgtrackingCategoryId,
          set.tcgtrackingSetId,
          tcgplayerProductId,
          tcgplayerSku,
        ),
        catalogProductKey: buildProductKey(
          set.tcgtrackingCategoryId,
          set.tcgtrackingSetId,
          tcgplayerProductId,
        ),
        categoryKey: set.categoryKey,
        setKey: set.key,
        tcgtrackingCategoryId: set.tcgtrackingCategoryId,
        tcgtrackingSetId: set.tcgtrackingSetId,
        tcgplayerProductId,
        tcgplayerSku,
        conditionCode: normalizeOptionalString(sku.cnd),
        variantCode: normalizeOptionalString(sku.var),
        languageCode: normalizeOptionalString(sku.lng),
        marketPriceCents:
          typeof sku.mkt === 'number' ? dollarsToCents(sku.mkt) : undefined,
        lowPriceCents:
          typeof sku.low === 'number' ? dollarsToCents(sku.low) : undefined,
        highPriceCents:
          typeof sku.hi === 'number' ? dollarsToCents(sku.hi) : undefined,
        listingCount: normalizeOptionalNumber(sku.cnt),
        pricingUpdatedAt,
      })
    }
  }

  return skus
}

async function loadSetByKey(ctx: ActionCtx, setKey: string) {
  const set = await ctx.runQuery(api.catalog.queries.getSetByKey, { setKey })
  if (!set) {
    throw new Error(`Catalog set not found: ${setKey}`)
  }

  return set
}

async function syncSingleSet(ctx: ActionCtx, setKey: string) {
  const set = await loadSetByKey(ctx, setKey)
  const syncStartedAt = Date.now()

  await ctx.runMutation(internal.catalog.mutations.markSetSyncStarted, {
    setKey,
    syncStartedAt,
  })

  try {
    // TODO: Split static product ingestion from pricing/SKU refreshes. During steady
    // state, the source changes pricing/SKUs far more often than product metadata, so
    // re-fetching and re-upserting the full product snapshot on every sync wastes work.
    const payload = await fetchCatalogSetPayload(
      set.tcgtrackingCategoryId,
      set.tcgtrackingSetId,
    )
    const products = mapProducts(set, payload)
    const skus = mapSkus(set, payload)

    for (const batch of chunk(products, PRODUCT_BATCH_SIZE)) {
      await ctx.runMutation(internal.catalog.mutations.upsertProductsBatch, {
        products: batch,
        syncStartedAt,
      })
    }

    for (const batch of chunk(skus, SKU_BATCH_SIZE)) {
      await ctx.runMutation(internal.catalog.mutations.upsertSkusBatch, {
        skus: batch,
        syncStartedAt,
      })
    }

    const cleanup = await cleanupSetSnapshot(ctx, setKey, syncStartedAt)
    const completedAt = Date.now()

    await ctx.runMutation(internal.catalog.mutations.markSetSyncCompleted, {
      setKey,
      completedAt,
    })

    return {
      setKey,
      productCount: products.length,
      skuCount: skus.length,
      cleanup,
      completedAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await ctx.runMutation(internal.catalog.mutations.markSetSyncFailed, {
      setKey,
      failedAt: Date.now(),
      message,
    })
    throw error
  }
}

async function cleanupSetSnapshot(
  ctx: ActionCtx,
  setKey: string,
  syncStartedAt: number,
) {
  let deletedProducts = 0
  let deletedSkus = 0
  let hasMoreProducts = true
  let hasMoreSkus = true

  while (hasMoreProducts || hasMoreSkus) {
    const result = await ctx.runMutation(internal.catalog.mutations.cleanupSetSnapshot, {
      setKey,
      syncStartedAt,
      productLimit: CLEANUP_PRODUCT_BATCH_SIZE,
      skuLimit: CLEANUP_SKU_BATCH_SIZE,
    })

    deletedProducts += result.deletedProducts
    deletedSkus += result.deletedSkus
    hasMoreProducts = result.hasMoreProducts
    hasMoreSkus = result.hasMoreSkus
  }

  return {
    deletedProducts,
    deletedSkus,
  }
}

async function refreshCatalogMetadata(
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

    for (const batch of chunk(sets.map((set) => mapSet(category, set)), 100)) {
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

async function runCatalogWindow(
  ctx: ActionCtx,
  limit: number | undefined,
): Promise<CatalogWindowResult> {
  const maxSets = Math.max(1, Math.min(limit ?? DEFAULT_SYNC_WINDOW, 25))

  await ctx.runMutation(internal.catalog.mutations.clearStuckSyncs, {
    thresholdMs: STUCK_SYNC_THRESHOLD_MS,
  })

  let metadataRefreshed = false
  const hasCatalogSets = await ctx.runQuery(api.catalog.queries.hasCatalogSets, {})
  if (!hasCatalogSets) {
    await refreshCatalogMetadata(ctx)
    metadataRefreshed = true
  }

  const candidates = await ctx.runMutation(
    internal.catalog.mutations.claimSyncCandidates,
    {
      limit: maxSets,
    },
  )

  for (const candidate of candidates) {
    await ctx.scheduler.runAfter(0, internal.catalog.sync.syncCatalogSet, {
      setKey: candidate.key,
    })
  }

  return {
    attempted: candidates.length,
    scheduled: candidates.length,
    metadataRefreshed,
    queuedSetKeys: candidates.map((candidate) => candidate.key),
  }
}

export const refreshMetadata = internalAction({
  args: {},
  handler: async (ctx): Promise<MetadataRefreshResult> => {
    return await refreshCatalogMetadata(ctx)
  },
})

export const syncCatalogWindow = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<CatalogWindowResult> => {
    return await runCatalogWindow(ctx, limit)
  },
})

export const syncCatalogSet = internalAction({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }): Promise<SyncSetSuccess> => {
    return await syncSingleSet(ctx, setKey)
  },
})

export const refreshMetadataNow = action({
  args: {},
  handler: async (ctx): Promise<MetadataRefreshResult> => {
    return await refreshCatalogMetadata(ctx)
  },
})

export const syncCatalogNow = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }): Promise<CatalogWindowResult> => {
    return await runCatalogWindow(ctx, limit)
  },
})
