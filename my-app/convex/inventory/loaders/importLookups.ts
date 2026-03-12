import { v } from 'convex/values'
import { internalQuery } from '../../_generated/server'
import { chunkArray } from '../../lib/collections'
import { loadLocationByCode } from './locations'

export const listCatalogSetMatchesForImport = internalQuery({
  args: {
    setNames: v.array(v.string()),
    setCodes: v.array(v.string()),
  },
  handler: async (ctx, { setNames, setCodes }) => {
    const byName = await Promise.all(
      [...new Set(setNames)]
        .filter((value) => value.trim().length > 0)
        .map(async (input) => ({
          input,
          matches: (await ctx.db
            .query('catalogSets')
            .withIndex('by_name', (q) => q.eq('name', input))
            .collect()).map((set) => ({
            key: set.key,
            name: set.name,
            abbreviation: set.abbreviation,
            inRuleScope: set.inRuleScope,
          })),
        })),
    )

    const byCode = await Promise.all(
      [...new Set(setCodes)]
        .filter((value) => value.trim().length > 0)
        .map(async (input) => ({
          input,
          matches: (await ctx.db
            .query('catalogSets')
            .withIndex('by_abbreviation', (q) => q.eq('abbreviation', input))
            .collect()).map((set) => ({
            key: set.key,
            name: set.name,
            abbreviation: set.abbreviation,
            inRuleScope: set.inRuleScope,
          })),
        })),
    )

    return {
      byName,
      byCode,
    }
  },
})

export const loadCatalogSkusForImport = internalQuery({
  args: {
    tcgplayerSkus: v.array(v.number()),
  },
  handler: async (ctx, { tcgplayerSkus }) => {
    const results: Array<{
      key: string
      setKey: string
      catalogProductKey: string
      tcgplayerSku: number
    }> = []

    for (const skuChunk of chunkArray([...new Set(tcgplayerSkus)], 200)) {
      const skus = await Promise.all(
        skuChunk.map(async (tcgplayerSku) =>
          await ctx.db
            .query('catalogSkus')
            .withIndex('by_tcgplayerSku', (q) => q.eq('tcgplayerSku', tcgplayerSku))
            .unique(),
        ),
      )

      results.push(
        ...skus
          .filter((sku): sku is NonNullable<(typeof skus)[number]> => sku !== null)
          .map((sku) => ({
            key: sku.key,
            setKey: sku.setKey,
            catalogProductKey: sku.catalogProductKey,
            tcgplayerSku: sku.tcgplayerSku,
          })),
      )
    }

    return {
      skus: results.map((sku) => ({
        key: sku.key,
        setKey: sku.setKey,
        catalogProductKey: sku.catalogProductKey,
        tcgplayerSku: sku.tcgplayerSku,
      })),
    }
  },
})

export const loadCatalogProductsForImport = internalQuery({
  args: {
    catalogProductKeys: v.array(v.string()),
    tcgplayerProductIds: v.array(v.number()),
  },
  handler: async (ctx, { catalogProductKeys, tcgplayerProductIds }) => {
    const productsByKey = new Map<
      string,
      {
        key: string
        setKey: string
        tcgplayerProductId: number
        name: string
        cleanName: string
      }
    >()

    for (const keyChunk of chunkArray([...new Set(catalogProductKeys)], 200)) {
      const products = await Promise.all(
        keyChunk.map(async (catalogProductKey) =>
          await ctx.db
            .query('catalogProducts')
            .withIndex('by_key', (q) => q.eq('key', catalogProductKey))
            .unique(),
        ),
      )

      for (const product of products) {
        if (!product) {
          continue
        }

        productsByKey.set(product.key, {
          key: product.key,
          setKey: product.setKey,
          tcgplayerProductId: product.tcgplayerProductId,
          name: product.name,
          cleanName: product.cleanName,
        })
      }
    }

    for (const idChunk of chunkArray([...new Set(tcgplayerProductIds)], 200)) {
      const products = await Promise.all(
        idChunk.map(async (tcgplayerProductId) =>
          await ctx.db
            .query('catalogProducts')
            .withIndex('by_tcgplayerProductId', (q) =>
              q.eq('tcgplayerProductId', tcgplayerProductId),
            )
            .unique(),
        ),
      )

      for (const product of products) {
        if (!product) {
          continue
        }

        productsByKey.set(product.key, {
          key: product.key,
          setKey: product.setKey,
          tcgplayerProductId: product.tcgplayerProductId,
          name: product.name,
          cleanName: product.cleanName,
        })
      }
    }

    return {
      products: [...productsByKey.values()],
    }
  },
})

export const listLocationsByCodes = internalQuery({
  args: {
    codes: v.array(v.string()),
  },
  handler: async (ctx, { codes }) => {
    const locations = await Promise.all(
      [...new Set(codes)]
        .filter((value) => value.trim().length > 0)
        .map(async (code) => await loadLocationByCode(ctx, code)),
    )

    return locations
      .filter((location): location is NonNullable<(typeof locations)[number]> => location !== null)
      .map((location) => ({
        _id: location._id,
        code: location.code,
        active: location.active,
        acceptsContents: location.acceptsContents,
        displayName: location.displayName,
      }))
  },
})
