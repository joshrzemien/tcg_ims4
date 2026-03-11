import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { ensureSetRuleTrackedForImport } from '../../pricing/workflows/ensureTrackedSet'
import { loadLocationByCode, loadLocationById } from '../loaders/locations'
import { ensurePhysicalLocationByCode } from '../workflows/systemLocations'
import { receiveCatalogContentIntoLocation } from '../workflows/contentReceipts'
import type { Id } from '../../_generated/dataModel'

export const prepareCsvImportCommit = internalMutation({
  args: {
    locationCodes: v.array(v.string()),
    locationsToCreate: v.array(
      v.object({
        code: v.string(),
        displayName: v.string(),
      }),
    ),
    setKeysToTrack: v.array(v.string()),
  },
  handler: async (ctx, { locationCodes, locationsToCreate, setKeysToTrack }) => {
    const locationIdsByCode: Record<string, Id<'inventoryLocations'>> = {}
    const locationsToCreateByCode = new Map(
      locationsToCreate.map((location) => [location.code, location]),
    )
    let createdLocationCount = 0

    for (const code of [...new Set(locationCodes)]) {
      const existing = await loadLocationByCode(ctx, code)
      if (existing) {
        if (!existing.active || !existing.acceptsContents) {
          throw new Error(`Inventory location cannot receive imports: ${code}`)
        }
        locationIdsByCode[code] = existing._id
        continue
      }

      const locationToCreate = locationsToCreateByCode.get(code)
      if (!locationToCreate) {
        throw new Error(`Import location was not prepared: ${code}`)
      }

      const created = await ensurePhysicalLocationByCode(ctx, code, true)
      await ctx.db.patch('inventoryLocations', created._id, {
        displayName: locationToCreate.displayName,
        notes: 'Auto-created from singles CSV import',
        updatedAt: Date.now(),
      })
      locationIdsByCode[code] = created._id
      createdLocationCount += 1
    }

    let createdRuleCount = 0
    let reactivatedRuleCount = 0
    for (const setKey of [...new Set(setKeysToTrack)]) {
      const result = await ensureSetRuleTrackedForImport(ctx, setKey)
      if (result.action === 'created') {
        createdRuleCount += 1
      } else if (result.action === 'reactivated') {
        reactivatedRuleCount += 1
      }
    }

    return {
      locationIdsByCode,
      createdLocationCount,
      createdRuleCount,
      reactivatedRuleCount,
    }
  },
})

export const applyCsvImportReceiptsBatch = internalMutation({
  args: {
    rows: v.array(
      v.object({
        locationId: v.id('inventoryLocations'),
        catalogProductKey: v.string(),
        catalogSkuKey: v.string(),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const locationIds = [...new Set(rows.map((row) => row.locationId))]
    const locations = await Promise.all(
      locationIds.map(async (locationId) => await loadLocationById(ctx, locationId)),
    )
    const locationsById = new Map(
      locations.map((location) => [location._id, location]),
    )

    for (const row of rows) {
      const location = locationsById.get(row.locationId)
      if (!location) {
        throw new Error(`Inventory location not found: ${row.locationId}`)
      }
      if (!location.active || !location.acceptsContents) {
        throw new Error(`Inventory location cannot receive imports: ${location.code}`)
      }

      await receiveCatalogContentIntoLocation(ctx, {
        location,
        inventoryClass: 'single',
        catalogProductKey: row.catalogProductKey,
        catalogSkuKey: row.catalogSkuKey,
        quantity: row.quantity,
        workflowStatus: 'available',
        actor: 'inventory_csv_import',
        reasonCode: 'csv_import',
      })
    }

    return {
      appliedRows: rows.length,
      receivedQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    }
  },
})
