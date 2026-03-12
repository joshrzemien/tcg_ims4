import { buildCatalogContentIdentityKey, buildPendingGradedContentIdentityKey } from '../shared/keys'
import { normalizeInventoryQuantity, normalizeOptionalString, normalizeWorkflowStatus } from '../shared/validation'
import { loadContentByIdentityKey } from '../loaders/contents'
import { insertInventoryEvent } from '../writers/events'
import { buildContentRecord } from '../writers/records'
import type { DbWriterCtx } from '../../lib/ctx'
import type { InventoryContentDoc, InventoryLocationDoc } from '../shared/types'

export async function receiveCatalogContentIntoLocation(
  ctx: DbWriterCtx,
  args: {
    location: InventoryLocationDoc
    inventoryClass: InventoryContentDoc['inventoryClass']
    catalogProductKey: string
    catalogSkuKey?: string
    quantity: number
    workflowStatus?: string
    workflowTag?: string
    notes?: string
    actor?: string
    reasonCode?: string
  },
) {
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
        locationId: args.location._id,
        inventoryClass: args.inventoryClass,
        catalogProductKey: args.catalogProductKey,
        catalogSkuKey: args.catalogSkuKey,
        quantity,
        workflowStatus,
        workflowTag,
        notes,
      }),
    )

    await ctx.db.patch('inventoryLocationContents', contentId, {
      contentIdentityKey: buildPendingGradedContentIdentityKey(contentId),
    })

    await insertInventoryEvent(ctx, {
      eventType: 'receive',
      actor: args.actor,
      reasonCode: args.reasonCode,
      targetContentId: contentId,
      toLocationId: args.location._id,
      inventoryClass: args.inventoryClass,
      catalogProductKey: args.catalogProductKey,
      catalogSkuKey: args.catalogSkuKey,
      quantityDelta: quantity,
      quantityBefore: 0,
      quantityAfter: quantity,
      workflowStatusAfter: workflowStatus,
      workflowTagAfter: workflowTag,
    })

    return contentId
  }

  const contentIdentityKey = buildCatalogContentIdentityKey({
    locationId: args.location._id,
    inventoryClass: args.inventoryClass,
    catalogProductKey: args.catalogProductKey,
    catalogSkuKey: args.catalogSkuKey,
  })
  const existing = await loadContentByIdentityKey(ctx, contentIdentityKey)

  if (existing) {
    if (
      existing.workflowStatus !== workflowStatus ||
      (existing.workflowTag ?? undefined) !== workflowTag
    ) {
      throw new Error(
        `Location ${args.location.code} already contains ${args.catalogProductKey} in a different workflow state`,
      )
    }

    const nextQuantity = existing.quantity + quantity
    await ctx.db.patch('inventoryLocationContents', existing._id, {
      quantity: nextQuantity,
      ...(notes ? { notes } : {}),
      updatedAt: Date.now(),
    })

    await insertInventoryEvent(ctx, {
      eventType: 'receive',
      actor: args.actor,
      reasonCode: args.reasonCode,
      targetContentId: existing._id,
      toLocationId: args.location._id,
      inventoryClass: args.inventoryClass,
      catalogProductKey: args.catalogProductKey,
      catalogSkuKey: args.catalogSkuKey,
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
      locationId: args.location._id,
      inventoryClass: args.inventoryClass,
      catalogProductKey: args.catalogProductKey,
      catalogSkuKey: args.catalogSkuKey,
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
    toLocationId: args.location._id,
    inventoryClass: args.inventoryClass,
    catalogProductKey: args.catalogProductKey,
    catalogSkuKey: args.catalogSkuKey,
    quantityDelta: quantity,
    quantityBefore: 0,
    quantityAfter: quantity,
    workflowStatusAfter: workflowStatus,
    workflowTagAfter: workflowTag,
  })

  return contentId
}
