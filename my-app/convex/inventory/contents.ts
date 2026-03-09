import { mutation, query } from '../_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import {
  buildGradedContentIdentityKey,
  buildInventoryContentRow,
  buildPendingGradedContentIdentityKey,
  normalizeInventoryQuantity,
  normalizeOptionalString,
  normalizeWorkflowStatus,
} from './model'
import {
  buildContentRecord,
  ensureLocationAcceptsContents,
  insertInventoryEvent,
  inventoryClassValidator,
  inventoryWorkflowStatusValidator,
  loadContentById,
  loadContentByIdentityKey,
  loadUnitDetailByContentId,
  normalizeMoveQuantity,
  normalizeQuantityDelta,
  resolveCatalogReference,
} from './shared'

type ContentDoc = Doc<'inventoryLocationContents'>
type CatalogProductDoc = Doc<'catalogProducts'>
type CatalogSetDoc = Doc<'catalogSets'>
type CatalogSkuDoc = Doc<'catalogSkus'>
type InventoryLocationDoc = Doc<'inventoryLocations'>
type InventoryUnitDetailDoc = Doc<'inventoryUnitDetails'>
type PricingTrackedSeriesDoc = Doc<'pricingTrackedSeries'>

async function loadProductsByKey(
  ctx: { db: any },
  productKeys: Iterable<string>,
) {
  const entries = await Promise.all(
    [...new Set(productKeys)].map(async (productKey) => {
      const product = await ctx.db
        .query('catalogProducts')
        .withIndex('by_key', (q: any) => q.eq('key', productKey))
        .unique()

      return [productKey, product] as const
    }),
  )

  return new Map<string, CatalogProductDoc | null>(entries)
}

async function loadSkusByKey(ctx: { db: any }, skuKeys: Iterable<string>) {
  const entries = await Promise.all(
    [...new Set(skuKeys)].map(async (skuKey) => {
      const sku = await ctx.db
        .query('catalogSkus')
        .withIndex('by_key', (q: any) => q.eq('key', skuKey))
        .unique()

      return [skuKey, sku] as const
    }),
  )

  return new Map<string, CatalogSkuDoc | null>(entries)
}

async function loadSetsByKey(ctx: { db: any }, setKeys: Iterable<string>) {
  const entries = await Promise.all(
    [...new Set(setKeys)].map(async (setKey) => {
      const set = await ctx.db
        .query('catalogSets')
        .withIndex('by_key', (q: any) => q.eq('key', setKey))
        .unique()

      return [setKey, set] as const
    }),
  )

  return new Map<string, CatalogSetDoc | null>(entries)
}

async function loadTrackedSeriesByProductKey(
  ctx: { db: any },
  productKeys: Iterable<string>,
) {
  const entries = await Promise.all(
    [...new Set(productKeys)].map(async (productKey) => {
      const trackedSeries = await ctx.db
        .query('pricingTrackedSeries')
        .withIndex('by_catalogProductKey', (q: any) =>
          q.eq('catalogProductKey', productKey),
        )
        .collect()

      return [productKey, trackedSeries] as const
    }),
  )

  return new Map<string, Array<PricingTrackedSeriesDoc>>(entries)
}

async function loadLocationsById(
  ctx: { db: any },
  locationIds: Iterable<Id<'inventoryLocations'>>,
) {
  const entries = await Promise.all(
    [...new Set(locationIds)].map(async (locationId) => {
      const location = await ctx.db.get(locationId)
      return [locationId, location] as const
    }),
  )

  return new Map<Id<'inventoryLocations'>, InventoryLocationDoc | null>(entries)
}

async function loadUnitDetailsByContentId(
  ctx: { db: any },
  contentIds: Iterable<Id<'inventoryLocationContents'>>,
) {
  const entries = await Promise.all(
    [...new Set(contentIds)].map(async (contentId) => {
      const detail = await ctx.db
        .query('inventoryUnitDetails')
        .withIndex('by_contentId', (q: any) => q.eq('contentId', contentId))
        .unique()

      return [contentId, detail] as const
    }),
  )

  return new Map<Id<'inventoryLocationContents'>, InventoryUnitDetailDoc | null>(
    entries,
  )
}

async function hydrateContentRows(
  ctx: { db: any },
  contents: Array<ContentDoc>,
) {
  const productsByKey = await loadProductsByKey(
    ctx,
    contents.map((content) => content.catalogProductKey),
  )
  const skusByKey = await loadSkusByKey(
    ctx,
    contents
      .map((content) => content.catalogSkuKey)
      .filter((value): value is string => typeof value === 'string'),
  )
  const trackedSeriesByProductKey = await loadTrackedSeriesByProductKey(
    ctx,
    contents.map((content) => content.catalogProductKey),
  )
  const locationsById = await loadLocationsById(
    ctx,
    contents.map((content) => content.locationId),
  )
  const unitDetailsByContentId = await loadUnitDetailsByContentId(
    ctx,
    contents.map((content) => content._id),
  )
  const setsByKey = await loadSetsByKey(
    ctx,
    contents
      .map((content) => productsByKey.get(content.catalogProductKey)?.setKey)
      .filter((value): value is string => typeof value === 'string'),
  )

  return contents.flatMap((content) => {
    const product = productsByKey.get(content.catalogProductKey)
    const location = locationsById.get(content.locationId)

    if (!product || !location) {
      return []
    }

    const sku =
      typeof content.catalogSkuKey === 'string'
        ? skusByKey.get(content.catalogSkuKey) ?? null
        : null

    return [
      buildInventoryContentRow({
        content,
        location,
        product,
        sku,
        set: setsByKey.get(product.setKey) ?? null,
        trackedSeries: trackedSeriesByProductKey.get(product.key) ?? [],
        unitDetail: unitDetailsByContentId.get(content._id) ?? null,
      }),
    ]
  })
}

async function removeContentRecord(
  ctx: { db: any },
  content: ContentDoc,
  params: {
    actor?: string
    reasonCode?: string
  },
) {
  const unitDetail = await loadUnitDetailByContentId(ctx, content._id)
  if (unitDetail) {
    await ctx.db.delete(unitDetail._id)
  }

  await ctx.db.delete(content._id)
  await insertInventoryEvent(ctx, {
    eventType: 'content_deleted',
    actor: params.actor,
    reasonCode: params.reasonCode,
    sourceContentId: content._id,
    fromLocationId: content.locationId,
    inventoryClass: content.inventoryClass,
    catalogProductKey: content.catalogProductKey,
    catalogSkuKey: content.catalogSkuKey,
    quantityDelta: -content.quantity,
    quantityBefore: content.quantity,
    quantityAfter: 0,
    workflowStatusBefore: content.workflowStatus,
    workflowStatusAfter: content.workflowStatus,
    workflowTagBefore: content.workflowTag,
    workflowTagAfter: content.workflowTag,
    ...(unitDetail ? { unitIdentityKey: unitDetail.unitIdentityKey } : {}),
  })
}

export const receiveIntoLocation = mutation({
  args: {
    locationId: v.id('inventoryLocations'),
    inventoryClass: inventoryClassValidator,
    catalogProductKey: v.string(),
    catalogSkuKey: v.optional(v.string()),
    quantity: v.number(),
    workflowStatus: v.optional(inventoryWorkflowStatusValidator),
    workflowTag: v.optional(v.string()),
    notes: v.optional(v.string()),
    actor: v.optional(v.string()),
    reasonCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const location = await ensureLocationAcceptsContents(ctx, args.locationId)
    const reference = await resolveCatalogReference({
      ctx,
      catalogProductKey: args.catalogProductKey,
      catalogSkuKey: args.catalogSkuKey,
    })
    const quantity = normalizeInventoryQuantity(args.quantity)
    if (quantity === 0) {
      throw new Error('Receive quantity must be greater than zero')
    }

    const workflowStatus = normalizeWorkflowStatus(args.workflowStatus)
    const workflowTag = normalizeOptionalString(args.workflowTag)
    const notes = normalizeOptionalString(args.notes)

    if (args.inventoryClass === 'graded') {
      if (quantity !== 1) {
        throw new Error('Graded inventory content must have quantity 1')
      }

      const contentId = await ctx.db.insert(
        'inventoryLocationContents',
        buildContentRecord({
          locationId: location._id,
          inventoryClass: args.inventoryClass,
          catalogProductKey: reference.catalogProductKey,
          catalogSkuKey: reference.catalogSkuKey,
          quantity,
          workflowStatus,
          workflowTag,
          notes,
        }),
      )

      await ctx.db.patch(contentId, {
        contentIdentityKey: buildPendingGradedContentIdentityKey(contentId),
      })

      await insertInventoryEvent(ctx, {
        eventType: 'receive',
        actor: args.actor,
        reasonCode: args.reasonCode,
        targetContentId: contentId,
        toLocationId: location._id,
        inventoryClass: args.inventoryClass,
        catalogProductKey: reference.catalogProductKey,
        catalogSkuKey: reference.catalogSkuKey,
        quantityDelta: quantity,
        quantityBefore: 0,
        quantityAfter: quantity,
        workflowStatusAfter: workflowStatus,
        workflowTagAfter: workflowTag,
      })

      return contentId
    }

    const contentIdentityKey = [
      'catalog',
      location._id,
      args.inventoryClass,
      reference.catalogProductKey,
      reference.catalogSkuKey ?? '_',
    ].join('|')
    const existing = await loadContentByIdentityKey(ctx, contentIdentityKey)

    if (existing) {
      if (
        existing.workflowStatus !== workflowStatus ||
        (existing.workflowTag ?? undefined) !== workflowTag
      ) {
        throw new Error(
          `Location ${location.code} already contains ${reference.catalogProductKey} in a different workflow state`,
        )
      }

      const nextQuantity = existing.quantity + quantity
      await ctx.db.patch(existing._id, {
        quantity: nextQuantity,
        ...(notes ? { notes } : {}),
        updatedAt: Date.now(),
      })

      await insertInventoryEvent(ctx, {
        eventType: 'receive',
        actor: args.actor,
        reasonCode: args.reasonCode,
        targetContentId: existing._id,
        toLocationId: location._id,
        inventoryClass: args.inventoryClass,
        catalogProductKey: reference.catalogProductKey,
        catalogSkuKey: reference.catalogSkuKey,
        quantityDelta: quantity,
        quantityBefore: existing.quantity,
        quantityAfter: nextQuantity,
        workflowStatusBefore: existing.workflowStatus,
        workflowStatusAfter: existing.workflowStatus,
        workflowTagBefore: existing.workflowTag,
        workflowTagAfter: existing.workflowTag,
      })

      return existing._id
    }

    const contentId = await ctx.db.insert(
      'inventoryLocationContents',
      buildContentRecord({
        locationId: location._id,
        inventoryClass: args.inventoryClass,
        catalogProductKey: reference.catalogProductKey,
        catalogSkuKey: reference.catalogSkuKey,
        quantity,
        workflowStatus,
        workflowTag,
        notes,
      }),
    )

    await insertInventoryEvent(ctx, {
      eventType: 'receive',
      actor: args.actor,
      reasonCode: args.reasonCode,
      targetContentId: contentId,
      toLocationId: location._id,
      inventoryClass: args.inventoryClass,
      catalogProductKey: reference.catalogProductKey,
      catalogSkuKey: reference.catalogSkuKey,
      quantityDelta: quantity,
      quantityBefore: 0,
      quantityAfter: quantity,
      workflowStatusAfter: workflowStatus,
      workflowTagAfter: workflowTag,
    })

    return contentId
  },
})

export const adjustQuantity = mutation({
  args: {
    contentId: v.id('inventoryLocationContents'),
    quantityDelta: v.number(),
    reasonCode: v.string(),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = await loadContentById(ctx, args.contentId)
    const quantityDelta = normalizeQuantityDelta(args.quantityDelta)
    const nextQuantity = content.quantity + quantityDelta

    if (nextQuantity < 0) {
      throw new Error('Adjustment would reduce quantity below zero')
    }

    if (content.inventoryClass === 'graded' && nextQuantity !== 0) {
      throw new Error('Graded inventory can only be adjusted down to zero')
    }

    if (nextQuantity === 0) {
      await insertInventoryEvent(ctx, {
        eventType: 'adjust',
        actor: args.actor,
        reasonCode: args.reasonCode,
        sourceContentId: content._id,
        fromLocationId: content.locationId,
        inventoryClass: content.inventoryClass,
        catalogProductKey: content.catalogProductKey,
        catalogSkuKey: content.catalogSkuKey,
        quantityDelta,
        quantityBefore: content.quantity,
        quantityAfter: 0,
        workflowStatusBefore: content.workflowStatus,
        workflowStatusAfter: content.workflowStatus,
        workflowTagBefore: content.workflowTag,
        workflowTagAfter: content.workflowTag,
      })
      await removeContentRecord(ctx, content, args)
      return null
    }

    await ctx.db.patch(content._id, {
      quantity: nextQuantity,
      updatedAt: Date.now(),
    })

    await insertInventoryEvent(ctx, {
      eventType: 'adjust',
      actor: args.actor,
      reasonCode: args.reasonCode,
      sourceContentId: content._id,
      targetContentId: content._id,
      fromLocationId: content.locationId,
      toLocationId: content.locationId,
      inventoryClass: content.inventoryClass,
      catalogProductKey: content.catalogProductKey,
      catalogSkuKey: content.catalogSkuKey,
      quantityDelta,
      quantityBefore: content.quantity,
      quantityAfter: nextQuantity,
      workflowStatusBefore: content.workflowStatus,
      workflowStatusAfter: content.workflowStatus,
      workflowTagBefore: content.workflowTag,
      workflowTagAfter: content.workflowTag,
    })

    return content._id
  },
})

export const moveQuantity = mutation({
  args: {
    contentId: v.id('inventoryLocationContents'),
    toLocationId: v.id('inventoryLocations'),
    quantity: v.number(),
    actor: v.optional(v.string()),
    reasonCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const source = await loadContentById(ctx, args.contentId)
    const toLocation = await ensureLocationAcceptsContents(ctx, args.toLocationId)
    const quantity = normalizeMoveQuantity(args.quantity)

    if (source.locationId === toLocation._id) {
      throw new Error('Destination location must be different from the source location')
    }

    if (quantity > source.quantity) {
      throw new Error('Move quantity exceeds source quantity')
    }

    if (source.inventoryClass === 'graded' && quantity !== 1) {
      throw new Error('Graded inventory can only be moved as a single unit')
    }

    const unitDetail = await loadUnitDetailByContentId(ctx, source._id)
    const nextSourceQuantity = source.quantity - quantity

    let targetContentId: Id<'inventoryLocationContents'>
    let targetBeforeQuantity = 0

    if (source.inventoryClass === 'graded') {
      targetContentId = await ctx.db.insert(
        'inventoryLocationContents',
        buildContentRecord({
          locationId: toLocation._id,
          inventoryClass: source.inventoryClass,
          catalogProductKey: source.catalogProductKey,
          catalogSkuKey: source.catalogSkuKey,
          quantity: 1,
          workflowStatus: source.workflowStatus,
          workflowTag: source.workflowTag,
          notes: source.notes,
        }),
      )

      if (unitDetail) {
        const nextIdentityKey = buildGradedContentIdentityKey({
          locationId: toLocation._id,
          unitIdentityKey: unitDetail.unitIdentityKey,
        })

        await ctx.db.patch(targetContentId, {
          contentIdentityKey: nextIdentityKey,
        })
        await ctx.db.patch(unitDetail._id, {
          contentId: targetContentId,
          updatedAt: Date.now(),
        })
      } else {
        await ctx.db.patch(targetContentId, {
          contentIdentityKey: buildPendingGradedContentIdentityKey(targetContentId),
        })
      }
    } else {
      const targetIdentityKey = [
        'catalog',
        toLocation._id,
        source.inventoryClass,
        source.catalogProductKey,
        source.catalogSkuKey ?? '_',
      ].join('|')
      const existingTarget = await loadContentByIdentityKey(ctx, targetIdentityKey)

      if (existingTarget) {
        if (
          existingTarget.workflowStatus !== source.workflowStatus ||
          (existingTarget.workflowTag ?? undefined) !==
            (source.workflowTag ?? undefined)
        ) {
          throw new Error(
            `Destination location ${toLocation.code} already contains this SKU in a different workflow state`,
          )
        }

        targetBeforeQuantity = existingTarget.quantity
        targetContentId = existingTarget._id
        await ctx.db.patch(existingTarget._id, {
          quantity: existingTarget.quantity + quantity,
          updatedAt: Date.now(),
        })
      } else {
        targetContentId = await ctx.db.insert(
          'inventoryLocationContents',
          buildContentRecord({
            locationId: toLocation._id,
            inventoryClass: source.inventoryClass,
            catalogProductKey: source.catalogProductKey,
            catalogSkuKey: source.catalogSkuKey,
            quantity,
            workflowStatus: source.workflowStatus,
            workflowTag: source.workflowTag,
            notes: source.notes,
          }),
        )
      }
    }

    if (nextSourceQuantity === 0) {
      await ctx.db.delete(source._id)
    } else {
      await ctx.db.patch(source._id, {
        quantity: nextSourceQuantity,
        updatedAt: Date.now(),
      })
    }

    await insertInventoryEvent(ctx, {
      eventType: 'move',
      actor: args.actor,
      reasonCode: args.reasonCode,
      sourceContentId: source._id,
      targetContentId,
      fromLocationId: source.locationId,
      toLocationId: toLocation._id,
      inventoryClass: source.inventoryClass,
      catalogProductKey: source.catalogProductKey,
      catalogSkuKey: source.catalogSkuKey,
      quantityDelta: quantity,
      quantityBefore: source.quantity,
      quantityAfter: targetBeforeQuantity + quantity,
      workflowStatusBefore: source.workflowStatus,
      workflowStatusAfter: source.workflowStatus,
      workflowTagBefore: source.workflowTag,
      workflowTagAfter: source.workflowTag,
      ...(unitDetail ? { unitIdentityKey: unitDetail.unitIdentityKey } : {}),
    })

    if (nextSourceQuantity === 0) {
      await insertInventoryEvent(ctx, {
        eventType: 'content_deleted',
        actor: args.actor,
        reasonCode: args.reasonCode ?? 'depleted_after_move',
        sourceContentId: source._id,
        fromLocationId: source.locationId,
        inventoryClass: source.inventoryClass,
        catalogProductKey: source.catalogProductKey,
        catalogSkuKey: source.catalogSkuKey,
        quantityDelta: -quantity,
        quantityBefore: source.quantity,
        quantityAfter: 0,
        workflowStatusBefore: source.workflowStatus,
        workflowStatusAfter: source.workflowStatus,
        workflowTagBefore: source.workflowTag,
        workflowTagAfter: source.workflowTag,
        ...(unitDetail ? { unitIdentityKey: unitDetail.unitIdentityKey } : {}),
      })
    }

    return targetContentId
  },
})

export const updateWorkflowState = mutation({
  args: {
    contentId: v.id('inventoryLocationContents'),
    workflowStatus: inventoryWorkflowStatusValidator,
    workflowTag: v.optional(v.string()),
    notes: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = await loadContentById(ctx, args.contentId)
    const workflowStatus = normalizeWorkflowStatus(args.workflowStatus)
    const workflowTag = normalizeOptionalString(args.workflowTag)
    const notes = normalizeOptionalString(args.notes)

    await ctx.db.patch(content._id, {
      workflowStatus,
      workflowTag,
      notes,
      updatedAt: Date.now(),
    })

    await insertInventoryEvent(ctx, {
      eventType: 'status_change',
      actor: args.actor,
      sourceContentId: content._id,
      targetContentId: content._id,
      fromLocationId: content.locationId,
      toLocationId: content.locationId,
      inventoryClass: content.inventoryClass,
      catalogProductKey: content.catalogProductKey,
      catalogSkuKey: content.catalogSkuKey,
      quantityDelta: 0,
      quantityBefore: content.quantity,
      quantityAfter: content.quantity,
      workflowStatusBefore: content.workflowStatus,
      workflowStatusAfter: workflowStatus,
      workflowTagBefore: content.workflowTag,
      workflowTagAfter: workflowTag,
    })

    return content._id
  },
})

export const removeContent = mutation({
  args: {
    contentId: v.id('inventoryLocationContents'),
    reasonCode: v.string(),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = await loadContentById(ctx, args.contentId)
    await removeContentRecord(ctx, content, args)
    return true
  },
})

export const getById = query({
  args: {
    contentId: v.id('inventoryLocationContents'),
  },
  handler: async (ctx, args) => {
    const content = await loadContentById(ctx, args.contentId)
    const rows = await hydrateContentRows(ctx, [content])
    return rows[0] ?? null
  },
})

export const listByLocation = query({
  args: {
    locationId: v.id('inventoryLocations'),
    inventoryClass: v.optional(inventoryClassValidator),
  },
  handler: async (ctx, args) => {
    const contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_locationId', (q) => q.eq('locationId', args.locationId))
      .collect()

    const filtered =
      args.inventoryClass
        ? contents.filter((content) => content.inventoryClass === args.inventoryClass)
        : contents

    return await hydrateContentRows(
      ctx,
      filtered.sort((left, right) => right.updatedAt - left.updatedAt),
    )
  },
})

export const listByProduct = query({
  args: {
    catalogProductKey: v.string(),
    inventoryClass: v.optional(inventoryClassValidator),
  },
  handler: async (ctx, args) => {
    const contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_catalogProductKey', (q) =>
        q.eq('catalogProductKey', args.catalogProductKey),
      )
      .collect()

    const filtered =
      args.inventoryClass
        ? contents.filter((content) => content.inventoryClass === args.inventoryClass)
        : contents

    return await hydrateContentRows(
      ctx,
      filtered.sort((left, right) => right.updatedAt - left.updatedAt),
    )
  },
})

export const listBySku = query({
  args: {
    catalogSkuKey: v.string(),
    inventoryClass: v.optional(inventoryClassValidator),
  },
  handler: async (ctx, args) => {
    const contents = await ctx.db
      .query('inventoryLocationContents')
      .withIndex('by_catalogSkuKey', (q) => q.eq('catalogSkuKey', args.catalogSkuKey))
      .collect()

    const filtered =
      args.inventoryClass
        ? contents.filter((content) => content.inventoryClass === args.inventoryClass)
        : contents

    return await hydrateContentRows(
      ctx,
      filtered.sort((left, right) => right.updatedAt - left.updatedAt),
    )
  },
})
