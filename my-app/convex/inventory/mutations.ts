import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import {
  normalizeInventoryMetadataFields,
  normalizeInventoryQuantity,
} from './model'
import type { Doc } from '../_generated/dataModel'

const inventoryTypeValidator = v.union(
  v.literal('single'),
  v.literal('sealed'),
)

const inventoryMetadataFieldValidator = v.object({
  key: v.string(),
  value: v.string(),
})

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

async function loadProductByKey(
  ctx: { db: any },
  catalogProductKey: string,
): Promise<Doc<'catalogProducts'>> {
  const product = await ctx.db
    .query('catalogProducts')
    .withIndex('by_key', (q: any) => q.eq('key', catalogProductKey))
    .unique()

  if (!product) {
    throw new Error(`Catalog product not found: ${catalogProductKey}`)
  }

  return product
}

async function loadSkuByKey(
  ctx: { db: any },
  catalogSkuKey: string,
): Promise<Doc<'catalogSkus'>> {
  const sku = await ctx.db
    .query('catalogSkus')
    .withIndex('by_key', (q: any) => q.eq('key', catalogSkuKey))
    .unique()

  if (!sku) {
    throw new Error(`Catalog sku not found: ${catalogSkuKey}`)
  }

  return sku
}

async function resolveInventoryReferences(params: {
  ctx: { db: any }
  inventoryType: 'single' | 'sealed'
  catalogProductKey: string
  catalogSkuKey?: string
}) {
  const { ctx, inventoryType, catalogProductKey, catalogSkuKey } = params
  const product = await loadProductByKey(ctx, catalogProductKey)
  let sku: Doc<'catalogSkus'> | undefined

  if (catalogSkuKey) {
    if (inventoryType === 'sealed') {
      throw new Error('Sealed inventory items cannot reference a catalog sku')
    }

    sku = await loadSkuByKey(ctx, catalogSkuKey)

    if (sku.catalogProductKey !== product.key) {
      throw new Error(
        `Catalog sku ${catalogSkuKey} does not belong to product ${catalogProductKey}`,
      )
    }
  }

  return {
    product,
    sku,
  }
}

export const addItem = mutation({
  args: {
    inventoryType: inventoryTypeValidator,
    catalogProductKey: v.string(),
    catalogSkuKey: v.optional(v.string()),
    quantity: v.number(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    metadataFields: v.optional(v.array(inventoryMetadataFieldValidator)),
  },
  handler: async (ctx, args) => {
    const quantity = normalizeInventoryQuantity(args.quantity)
    const catalogProductKey = args.catalogProductKey.trim()

    if (!catalogProductKey) {
      throw new Error('catalogProductKey is required')
    }

    const catalogSkuKey = normalizeOptionalString(args.catalogSkuKey)
    const location = normalizeOptionalString(args.location)
    const notes = normalizeOptionalString(args.notes)
    const metadataFields = normalizeInventoryMetadataFields(args.metadataFields)

    await resolveInventoryReferences({
      ctx,
      inventoryType: args.inventoryType,
      catalogProductKey,
      catalogSkuKey,
    })

    const now = Date.now()

    return await ctx.db.insert('inventoryItems', {
      inventoryType: args.inventoryType,
      catalogProductKey,
      ...(catalogSkuKey ? { catalogSkuKey } : {}),
      quantity,
      ...(location ? { location } : {}),
      ...(notes ? { notes } : {}),
      ...(metadataFields ? { metadataFields } : {}),
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const updateItem = mutation({
  args: {
    inventoryItemId: v.id('inventoryItems'),
    inventoryType: v.optional(inventoryTypeValidator),
    catalogProductKey: v.optional(v.string()),
    catalogSkuKey: v.optional(v.string()),
    quantity: v.optional(v.number()),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    metadataFields: v.optional(v.array(inventoryMetadataFieldValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get('inventoryItems', args.inventoryItemId)

    if (!existing) {
      throw new Error(`Inventory item not found: ${args.inventoryItemId}`)
    }

    const inventoryType = args.inventoryType ?? existing.inventoryType
    const catalogProductKey = normalizeOptionalString(args.catalogProductKey)
      ?? existing.catalogProductKey
    const catalogSkuKey =
      normalizeOptionalString(args.catalogSkuKey) ?? existing.catalogSkuKey

    await resolveInventoryReferences({
      ctx,
      inventoryType,
      catalogProductKey,
      catalogSkuKey,
    })

    const patch: Partial<Doc<'inventoryItems'>> = {
      inventoryType,
      catalogProductKey,
      updatedAt: Date.now(),
    }

    if (typeof args.quantity === 'number') {
      patch.quantity = normalizeInventoryQuantity(args.quantity)
    }

    if ('catalogSkuKey' in args) {
      patch.catalogSkuKey = catalogSkuKey
    }

    if ('location' in args) {
      patch.location = normalizeOptionalString(args.location)
    }

    if ('notes' in args) {
      patch.notes = normalizeOptionalString(args.notes)
    }

    if ('metadataFields' in args) {
      patch.metadataFields = normalizeInventoryMetadataFields(args.metadataFields)
    }

    await ctx.db.patch('inventoryItems', args.inventoryItemId, patch)

    return args.inventoryItemId
  },
})

export const removeItem = mutation({
  args: {
    inventoryItemId: v.id('inventoryItems'),
  },
  handler: async (ctx, { inventoryItemId }) => {
    const existing = await ctx.db.get('inventoryItems', inventoryItemId)

    if (!existing) {
      return false
    }

    await ctx.db.delete('inventoryItems', inventoryItemId)
    return true
  },
})
