import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import {
  buildCatalogContentIdentityKey,
  buildEmptyWorkflowBreakdown,
  buildParentLocationCode,
  normalizeInventoryQuantity,
  normalizeLocationCode,
  normalizeOptionalString,
  normalizeWorkflowStatus,
  parseLocationCode,
  validateInventoryContent,
} from './model'

export const inventoryClassValidator = v.union(
  v.literal('single'),
  v.literal('sealed'),
  v.literal('graded'),
)

export const inventoryLocationKindValidator = v.union(
  v.literal('physical'),
  v.literal('system'),
)

export const inventoryWorkflowStatusValidator = v.union(
  v.literal('available'),
  v.literal('processing'),
  v.literal('hold'),
)

export const inventoryReferenceKindValidator = v.literal('catalog')

export const inventoryUnitKindValidator = v.literal('graded_card')

type DbCtx = { db: any }

export const SYSTEM_LOCATION_CODES = {
  unassigned: 'SYS:UNASSIGNED',
  adjustment: 'SYS:ADJUSTMENT',
} as const

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

export async function loadLocationById(
  ctx: DbCtx,
  locationId: Id<'inventoryLocations'>,
) {
  const location = await ctx.db.get(locationId)
  if (!location) {
    throw new Error(`Inventory location not found: ${locationId}`)
  }

  return location as Doc<'inventoryLocations'>
}

export async function loadLocationByCode(ctx: DbCtx, code: string) {
  const normalizedCode = normalizeLocationCode(code)
  return (await ctx.db
    .query('inventoryLocations')
    .withIndex('by_code', (q: any) => q.eq('code', normalizedCode))
    .unique()) as Doc<'inventoryLocations'> | null
}

export async function requireLocationByCode(ctx: DbCtx, code: string) {
  const location = await loadLocationByCode(ctx, code)
  if (!location) {
    throw new Error(`Inventory location not found: ${normalizeLocationCode(code)}`)
  }

  return location
}

export async function ensureLocationAcceptsContents(
  ctx: DbCtx,
  locationId: Id<'inventoryLocations'>,
) {
  const location = await loadLocationById(ctx, locationId)
  if (!location.active) {
    throw new Error(`Inventory location is inactive: ${location.code}`)
  }
  if (!location.acceptsContents) {
    throw new Error(`Inventory location does not accept contents: ${location.code}`)
  }

  return location
}

export async function loadProductByKey(ctx: DbCtx, catalogProductKey: string) {
  const product = await ctx.db
    .query('catalogProducts')
    .withIndex('by_key', (q: any) => q.eq('key', catalogProductKey))
    .unique()

  if (!product) {
    throw new Error(`Catalog product not found: ${catalogProductKey}`)
  }

  return product as Doc<'catalogProducts'>
}

export async function loadSkuByKey(ctx: DbCtx, catalogSkuKey: string) {
  const sku = await ctx.db
    .query('catalogSkus')
    .withIndex('by_key', (q: any) => q.eq('key', catalogSkuKey))
    .unique()

  if (!sku) {
    throw new Error(`Catalog sku not found: ${catalogSkuKey}`)
  }

  return sku as Doc<'catalogSkus'>
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

export async function loadContentById(
  ctx: DbCtx,
  contentId: Id<'inventoryLocationContents'>,
) {
  const content = await ctx.db.get(contentId)
  if (!content) {
    throw new Error(`Inventory content not found: ${contentId}`)
  }

  return content as Doc<'inventoryLocationContents'>
}

export async function loadUnitDetailByContentId(
  ctx: DbCtx,
  contentId: Id<'inventoryLocationContents'>,
) {
  return (await ctx.db
    .query('inventoryUnitDetails')
    .withIndex('by_contentId', (q: any) => q.eq('contentId', contentId))
    .unique()) as Doc<'inventoryUnitDetails'> | null
}

export async function loadContentByIdentityKey(
  ctx: DbCtx,
  contentIdentityKey: string,
) {
  return (await ctx.db
    .query('inventoryLocationContents')
    .withIndex('by_contentIdentityKey', (q: any) =>
      q.eq('contentIdentityKey', contentIdentityKey),
    )
    .unique()) as Doc<'inventoryLocationContents'> | null
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
  ctx: DbCtx,
  params: Parameters<typeof buildEventRecord>[0],
) {
  return await ctx.db.insert('inventoryEvents', buildEventRecord(params))
}

export async function ensureSystemLocation(
  ctx: DbCtx,
  params: {
    code: string
    displayName: string
    acceptsContents: boolean
    notes?: string
  },
) {
  const code = normalizeLocationCode(params.code)
  const existing = await loadLocationByCode(ctx, code)
  if (existing) {
    return existing
  }

  const locationId = await ctx.db.insert(
    'inventoryLocations',
    buildLocationRecord({
      code,
      kind: 'system',
      acceptsContents: params.acceptsContents,
      displayName: params.displayName,
      notes: params.notes,
    }),
  )

  return (await ctx.db.get(locationId)) as Doc<'inventoryLocations'>
}

export async function ensurePhysicalLocationByCode(
  ctx: DbCtx,
  code: string,
  acceptsContents = true,
): Promise<Doc<'inventoryLocations'>> {
  const normalizedCode = normalizeLocationCode(code)
  const existing = await loadLocationByCode(ctx, normalizedCode)
  if (existing) {
    return existing
  }

  const parentCode = buildParentLocationCode(normalizedCode)
  const parentLocation: Doc<'inventoryLocations'> | undefined = parentCode
    ? await ensurePhysicalLocationByCode(ctx, parentCode, false)
    : undefined

  const locationId: Id<'inventoryLocations'> = await ctx.db.insert(
    'inventoryLocations',
    buildLocationRecord({
      code: normalizedCode,
      kind: 'physical',
      parentLocationId: parentLocation?._id,
      acceptsContents,
    }),
  )

  return (await ctx.db.get(locationId)) as Doc<'inventoryLocations'>
}

export function summarizeWorkflowBreakdown(
  contents: Array<Doc<'inventoryLocationContents'>>,
) {
  return contents.reduce((breakdown, content) => {
    breakdown[content.workflowStatus] += content.quantity
    return breakdown
  }, buildEmptyWorkflowBreakdown())
}

export function normalizeQuantityDelta(quantityDelta: number) {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new Error('quantityDelta must be a non-zero integer')
  }

  return quantityDelta
}

export function normalizeMoveQuantity(quantity: number) {
  const normalized = normalizeInventoryQuantity(quantity)
  if (normalized === 0) {
    throw new Error('Move quantity must be greater than zero')
  }

  return normalized
}
