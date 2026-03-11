import { buildCatalogContentIdentityKey } from '../shared/keys'
import {
  normalizeLocationCode,
  normalizeOptionalString,
  normalizeWorkflowStatus,
  parseLocationCode,
  validateInventoryContent,
} from '../shared/validation'
import type { Doc, Id } from '../../_generated/dataModel'

export function buildLocationRecord(input: {
  code: string
  kind: Doc<'inventoryLocations'>['kind']
  parentLocationId?: Id<'inventoryLocations'>
  acceptsContents: boolean
  displayName?: string
  notes?: string
  active?: boolean
}) {
  const parsed = parseLocationCode(input.code)
  const now = Date.now()

  return {
    code: parsed.code,
    kind: input.kind,
    ...(input.parentLocationId ? { parentLocationId: input.parentLocationId } : {}),
    pathSegments: parsed.pathSegments,
    depth: parsed.depth,
    acceptsContents: input.acceptsContents,
    ...(normalizeOptionalString(input.displayName)
      ? { displayName: normalizeOptionalString(input.displayName) }
      : {}),
    ...(normalizeOptionalString(input.notes)
      ? { notes: normalizeOptionalString(input.notes) }
      : {}),
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildContentRecord(params: {
  locationId: Id<'inventoryLocations'>
  inventoryClass: Doc<'inventoryLocationContents'>['inventoryClass']
  catalogProductKey: string
  catalogSkuKey?: string
  quantity: number
  workflowStatus?: string
  workflowTag?: string
  notes?: string
}) {
  const quantity = validateInventoryContent({
    inventoryClass: params.inventoryClass,
    quantity: params.quantity,
  })
  const workflowStatus = normalizeWorkflowStatus(params.workflowStatus)
  const workflowTag = normalizeOptionalString(params.workflowTag)
  const notes = normalizeOptionalString(params.notes)
  const catalogSkuKey = normalizeOptionalString(params.catalogSkuKey)
  const now = Date.now()

  return {
    locationId: params.locationId,
    inventoryClass: params.inventoryClass,
    referenceKind: 'catalog' as const,
    catalogProductKey: params.catalogProductKey,
    ...(catalogSkuKey ? { catalogSkuKey } : {}),
    quantity,
    workflowStatus,
    ...(workflowTag ? { workflowTag } : {}),
    ...(notes ? { notes } : {}),
    contentIdentityKey:
      params.inventoryClass === 'graded'
        ? ''
        : buildCatalogContentIdentityKey({
            locationId: params.locationId,
            inventoryClass: params.inventoryClass,
            catalogProductKey: params.catalogProductKey,
            catalogSkuKey,
          }),
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeInventoryLocationCode(code: string) {
  return normalizeLocationCode(code)
}
