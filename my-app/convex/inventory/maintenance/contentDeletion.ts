import { loadUnitDetailByContentId } from '../loaders/contents'
import { insertInventoryEvent } from '../writers/events'
import type { DbWriterCtx } from '../../lib/ctx'
import type { InventoryContentDoc } from '../shared/types'

export async function removeContentRecord(
  ctx: DbWriterCtx,
  content: InventoryContentDoc,
  params: {
    actor?: string
    reasonCode?: string
  },
) {
  const unitDetail = await loadUnitDetailByContentId(ctx, content._id)
  if (unitDetail) {
    await ctx.db.delete('inventoryUnitDetails', unitDetail._id)
  }

  await ctx.db.delete('inventoryLocationContents', content._id)
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
