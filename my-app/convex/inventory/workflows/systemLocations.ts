import { loadLocationByCode, loadLocationById } from '../loaders/locations'
import { SYSTEM_LOCATION_CODES } from '../shared/validators'
import { buildParentLocationCode, normalizeLocationCode } from '../shared/validation'
import { buildLocationRecord } from '../writers/records'
import type { DbWriterCtx } from '../../lib/ctx'
import type { Doc, Id } from '../../_generated/dataModel'

export { SYSTEM_LOCATION_CODES }

export async function ensureSystemLocation(
  ctx: DbWriterCtx,
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

  return await loadLocationById(ctx, locationId as Id<'inventoryLocations'>)
}

export async function ensurePhysicalLocationByCode(
  ctx: DbWriterCtx,
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

  const locationId = await ctx.db.insert(
    'inventoryLocations',
    buildLocationRecord({
      code: normalizedCode,
      kind: 'physical',
      parentLocationId: parentLocation?._id,
      acceptsContents,
    }),
  )

  return await loadLocationById(ctx, locationId as Id<'inventoryLocations'>)
}
