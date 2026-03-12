import { v } from 'convex/values'
import { mutation, query } from '../_generated/server'
import {
  buildLocationRecord,
  ensurePhysicalLocationByCode,
  inventoryLocationKindValidator,
  loadLocationByCode,
  loadLocationById,
} from './shared'
import {
  buildParentLocationCode,
  normalizeLocationCode,
  normalizeOptionalString,
} from './model'

function sortLocations<T extends { code: string }>(locations: Array<T>) {
  return [...locations].sort((left, right) => left.code.localeCompare(right.code))
}

export const create = mutation({
  args: {
    code: v.string(),
    kind: inventoryLocationKindValidator,
    parentLocationId: v.optional(v.id('inventoryLocations')),
    acceptsContents: v.boolean(),
    displayName: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const normalizedCode = normalizeLocationCode(args.code)
    const existing = await loadLocationByCode(ctx, normalizedCode)
    if (existing) {
      throw new Error(`Inventory location already exists: ${normalizedCode}`)
    }

    let parentLocationId = args.parentLocationId

    if (args.kind === 'physical' && !parentLocationId) {
      const parentCode = buildParentLocationCode(normalizedCode)
      if (parentCode) {
        parentLocationId = (await ensurePhysicalLocationByCode(ctx, parentCode, false))._id
      }
    }

    if (parentLocationId) {
      await loadLocationById(ctx, parentLocationId)
    }

    return await ctx.db.insert(
      'inventoryLocations',
      buildLocationRecord({
        code: normalizedCode,
        kind: args.kind,
        parentLocationId,
        acceptsContents: args.acceptsContents,
        displayName: args.displayName,
        notes: args.notes,
        active: args.active,
      }),
    )
  },
})

export const update = mutation({
  args: {
    locationId: v.id('inventoryLocations'),
    acceptsContents: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await loadLocationById(ctx, args.locationId)
    const patch: Partial<typeof existing> = {
      updatedAt: Date.now(),
    }

    if ('acceptsContents' in args) {
      patch.acceptsContents = args.acceptsContents
    }

    if ('displayName' in args) {
      patch.displayName = normalizeOptionalString(args.displayName)
    }

    if ('notes' in args) {
      patch.notes = normalizeOptionalString(args.notes)
    }

    if ('active' in args) {
      patch.active = args.active
    }

    await ctx.db.patch('inventoryLocations', args.locationId, patch)
    return args.locationId
  },
})

export const getById = query({
  args: {
    locationId: v.id('inventoryLocations'),
  },
  handler: async (ctx, args) => {
    return await loadLocationById(ctx, args.locationId)
  },
})

export const getByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    return await loadLocationByCode(ctx, args.code)
  },
})

export const listChildren = query({
  args: {
    parentLocationId: v.optional(v.id('inventoryLocations')),
  },
  handler: async (ctx, args) => {
    const locations = await ctx.db.query('inventoryLocations').collect()
    return sortLocations(
      locations.filter((location) =>
        args.parentLocationId
          ? location.parentLocationId === args.parentLocationId
          : !location.parentLocationId,
      ),
    )
  },
})

export const listAssignable = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const locations = await ctx.db
      .query('inventoryLocations')
      .withIndex('by_acceptsContents', (q) => q.eq('acceptsContents', true))
      .collect()

    return sortLocations(
      locations.filter((location) => (args.activeOnly ?? true ? location.active : true)),
    )
  },
})
