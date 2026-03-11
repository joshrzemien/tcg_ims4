import { normalizeOptionalString } from '../shared/validation'
import type { Doc } from '../../_generated/dataModel'
import type { DbCtx } from '../../lib/ctx'

export async function loadProductByKey(ctx: DbCtx, catalogProductKey: string) {
  const product = await ctx.db
    .query('catalogProducts')
    .withIndex('by_key', (q: any) => q.eq('key', catalogProductKey))
    .unique()

  if (!product) {
    throw new Error(`Catalog product not found: ${catalogProductKey}`)
  }

  return product
}

export async function loadSkuByKey(ctx: DbCtx, catalogSkuKey: string) {
  const sku = await ctx.db
    .query('catalogSkus')
    .withIndex('by_key', (q: any) => q.eq('key', catalogSkuKey))
    .unique()

  if (!sku) {
    throw new Error(`Catalog sku not found: ${catalogSkuKey}`)
  }

  return sku
}

export async function resolveCatalogReference(params: {
  ctx: DbCtx
  catalogProductKey: string
  catalogSkuKey?: string
}) {
  const catalogProductKey = normalizeOptionalString(params.catalogProductKey)
  if (!catalogProductKey) {
    throw new Error('catalogProductKey is required')
  }

  const product = await loadProductByKey(params.ctx, catalogProductKey)
  const catalogSkuKey = normalizeOptionalString(params.catalogSkuKey)
  let sku: Doc<'catalogSkus'> | undefined

  if (catalogSkuKey) {
    sku = await loadSkuByKey(params.ctx, catalogSkuKey)
    if (sku.catalogProductKey !== product.key) {
      throw new Error(
        `Catalog sku ${catalogSkuKey} does not belong to product ${catalogProductKey}`,
      )
    }
  }

  return {
    product,
    sku,
    catalogProductKey,
    catalogSkuKey,
  }
}
