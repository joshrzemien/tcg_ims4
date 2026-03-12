import { normalizeLocationCode } from '../shared/validation'
import type { Id } from '../../_generated/dataModel'
import type { DbCtx } from '../../lib/ctx'

export async function loadLocationById(
  ctx: DbCtx,
  locationId: Id<'inventoryLocations'>,
) {
  const location = await ctx.db.get('inventoryLocations', locationId)
  if (!location) {
    throw new Error(`Inventory location not found: ${locationId}`)
  }

  return location
}

export async function loadLocationByCode(ctx: DbCtx, code: string) {
  const normalizedCode = normalizeLocationCode(code)
  return (await ctx.db
    .query('inventoryLocations')
    .withIndex('by_code', (q: any) => q.eq('code', normalizedCode))
    .unique())
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
