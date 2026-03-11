import { normalizeOptionalString } from '../shared/validation'
import type { Doc, Id } from '../../_generated/dataModel'
import type { DbWriterCtx } from '../../lib/ctx'

export function buildEventRecord(params: {
  eventType: Doc<'inventoryEvents'>['eventType']
  actor?: string
  reasonCode?: string
  sourceContentId?: Id<'inventoryLocationContents'>
  targetContentId?: Id<'inventoryLocationContents'>
  fromLocationId?: Id<'inventoryLocations'>
  toLocationId?: Id<'inventoryLocations'>
  inventoryClass: Doc<'inventoryEvents'>['inventoryClass']
  catalogProductKey: string
  catalogSkuKey?: string
  quantityDelta: number
  quantityBefore?: number
  quantityAfter?: number
  workflowStatusBefore?: Doc<'inventoryEvents'>['workflowStatusBefore']
  workflowStatusAfter?: Doc<'inventoryEvents'>['workflowStatusAfter']
  workflowTagBefore?: string
  workflowTagAfter?: string
  unitIdentityKey?: string
  metadataSnapshot?: Record<string, unknown>
}) {
  return {
    eventType: params.eventType,
    occurredAt: Date.now(),
    ...(normalizeOptionalString(params.actor) ? { actor: normalizeOptionalString(params.actor) } : {}),
    ...(normalizeOptionalString(params.reasonCode)
      ? { reasonCode: normalizeOptionalString(params.reasonCode) }
      : {}),
    ...(params.sourceContentId ? { sourceContentId: params.sourceContentId } : {}),
    ...(params.targetContentId ? { targetContentId: params.targetContentId } : {}),
    ...(params.fromLocationId ? { fromLocationId: params.fromLocationId } : {}),
    ...(params.toLocationId ? { toLocationId: params.toLocationId } : {}),
    inventoryClass: params.inventoryClass,
    referenceKind: 'catalog' as const,
    catalogProductKey: params.catalogProductKey,
    ...(normalizeOptionalString(params.catalogSkuKey)
      ? { catalogSkuKey: normalizeOptionalString(params.catalogSkuKey) }
      : {}),
    quantityDelta: params.quantityDelta,
    ...(typeof params.quantityBefore === 'number'
      ? { quantityBefore: params.quantityBefore }
      : {}),
    ...(typeof params.quantityAfter === 'number'
      ? { quantityAfter: params.quantityAfter }
      : {}),
    ...(params.workflowStatusBefore ? { workflowStatusBefore: params.workflowStatusBefore } : {}),
    ...(params.workflowStatusAfter ? { workflowStatusAfter: params.workflowStatusAfter } : {}),
    ...(normalizeOptionalString(params.workflowTagBefore)
      ? { workflowTagBefore: normalizeOptionalString(params.workflowTagBefore) }
      : {}),
    ...(normalizeOptionalString(params.workflowTagAfter)
      ? { workflowTagAfter: normalizeOptionalString(params.workflowTagAfter) }
      : {}),
    ...(normalizeOptionalString(params.unitIdentityKey)
      ? { unitIdentityKey: normalizeOptionalString(params.unitIdentityKey) }
      : {}),
    ...(params.metadataSnapshot ? { metadataSnapshot: params.metadataSnapshot } : {}),
  }
}

export async function insertInventoryEvent(
  ctx: DbWriterCtx,
  params: Parameters<typeof buildEventRecord>[0],
) {
  return await ctx.db.insert('inventoryEvents', buildEventRecord(params))
}
