import { mutation } from '../_generated/server'
import {
  ensureSystemLocation,
  SYSTEM_LOCATION_CODES,
} from './shared'

async function ensureDefaultSystemLocations(ctx: { db: any }) {
  const unassigned = await ensureSystemLocation(ctx, {
    code: SYSTEM_LOCATION_CODES.unassigned,
    displayName: 'Unassigned',
    acceptsContents: true,
    notes: 'Default location for inventory that has not been assigned to a physical slot.',
  })

  const adjustment = await ensureSystemLocation(ctx, {
    code: SYSTEM_LOCATION_CODES.adjustment,
    displayName: 'Adjustment',
    acceptsContents: false,
    notes: 'Reserved system location for future adjustment bookkeeping.',
  })

  return {
    unassigned,
    adjustment,
  }
}

export const ensureSystemLocations = mutation({
  args: {},
  handler: async (ctx) => {
    return await ensureDefaultSystemLocations(ctx)
  },
})
