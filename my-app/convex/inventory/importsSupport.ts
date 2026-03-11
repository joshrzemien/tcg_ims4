import { v } from 'convex/values'
import {
  internalMutation,
  internalQuery,
} from '../_generated/server'
import { ensureSetRuleTrackedForImport } from '../pricing/workflows/ensureTrackedSet'
import { receiveCatalogContentIntoLocation } from './contents'
import {
  ensurePhysicalLocationByCode,
  loadLocationByCode,
  loadLocationById,
} from './shared'
import type { Doc, Id } from '../_generated/dataModel'

export const CSV_IMPORT_WRITE_BATCH_SIZE = 150
export const CSV_IMPORT_PREVIEW_SAMPLE_LIMIT = 25

export const CSV_IMPORT_REQUIRED_HEADERS = [
  'Set',
  'Set Code',
  'Name',
  'Quantity',
  'Remarks',
  'SKU Id',
  'ID Product',
  'Printing',
  'Condition',
  'Language',
] as const

export type CsvImportSkipReason =
  | 'unknown_set'
  | 'unknown_sku'
  | 'sku_set_mismatch'
  | 'sku_product_mismatch'
  | 'invalid_quantity'
  | 'invalid_location_source'

export type ParsedCsvImportRow = {
  rowNumber: number
  setName: string
  setCode?: string
  name: string
  quantity?: number
  remarks: string
  skuId?: number
  productId?: number
  printing: string
  condition: string
  language: string
}

export type ImportSetSummary = Pick<
  Doc<'catalogSets'>,
  'key' | 'name' | 'abbreviation' | 'inRuleScope'
>

type ImportProductSummary = Pick<
  Doc<'catalogProducts'>,
  'key' | 'setKey' | 'tcgplayerProductId' | 'name' | 'cleanName'
>

type ImportSkuSummary = Pick<
  Doc<'catalogSkus'>,
  'key' | 'setKey' | 'catalogProductKey' | 'tcgplayerSku'
>

type ImportLocationSummary = Pick<
  Doc<'inventoryLocations'>,
  '_id' | 'code' | 'active' | 'acceptsContents' | 'displayName'
>

export type CsvImportSkippedRow = {
  rowNumber: number
  setName: string
  name: string
  skuId?: number
  reason: CsvImportSkipReason
  message: string
}

export type CsvImportAggregatedRow = {
  locationCode: string
  locationDisplayName: string
  catalogProductKey: string
  catalogSkuKey: string
  quantity: number
  setKey: string
  setName: string
  productName: string
}

export type CsvImportLocationToCreate = {
  code: string
  displayName: string
}

export type CsvImportSetToTrack = {
  setKey: string
  setName: string
}

export type CsvImportPlan = {
  totalRows: number
  matchedRowCount: number
  totalQuantity: number
  aggregatedRows: Array<CsvImportAggregatedRow>
  locationsToCreate: Array<CsvImportLocationToCreate>
  setsToTrack: Array<CsvImportSetToTrack>
  skippedRows: Array<CsvImportSkippedRow>
}

function buildLocationKey(remarks: string) {
  const normalized = remarks
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!normalized) {
    return null
  }

  return {
    code: `IMPORT:${normalized}`,
    displayName: remarks.trim(),
  }
}

export function sanitizeImportLocationCode(remarks: string | undefined) {
  return remarks ? buildLocationKey(remarks)?.code ?? null : null
}

export function resolveImportSetForRow(
  row: Pick<ParsedCsvImportRow, 'setName' | 'setCode'>,
  setsByName: Map<string, Array<ImportSetSummary>>,
  setsByCode: Map<string, Array<ImportSetSummary>>,
) {
  const nameMatches = setsByName.get(row.setName) ?? []

  if (nameMatches.length === 1) {
    return nameMatches[0]
  }

  if (nameMatches.length > 1) {
    if (row.setCode) {
      const abbreviationMatches = nameMatches.filter(
        (set) => (set.abbreviation ?? '') === row.setCode,
      )
      if (abbreviationMatches.length === 1) {
        return abbreviationMatches[0]
      }
    }

    return null
  }

  if (!row.setCode) {
    return null
  }

  const codeMatches = setsByCode.get(row.setCode) ?? []
  return codeMatches.length === 1 ? codeMatches[0] : null
}

export function aggregateMatchedImportRows(
  rows: Array<CsvImportAggregatedRow>,
) {
  const aggregated = new Map<string, CsvImportAggregatedRow>()

  for (const row of rows) {
    const key = [
      row.locationCode,
      row.catalogProductKey,
      row.catalogSkuKey,
      'available',
    ].join('|')
    const existing = aggregated.get(key)

    if (existing) {
      existing.quantity += row.quantity
      continue
    }

    aggregated.set(key, { ...row })
  }

  return [...aggregated.values()].sort((left, right) =>
    [
      left.locationCode,
      left.setName,
      left.productName,
      left.catalogSkuKey,
    ]
      .join('|')
      .localeCompare(
        [
          right.locationCode,
          right.setName,
          right.productName,
          right.catalogSkuKey,
        ].join('|'),
      ),
  )
}

export function summarizeSkippedRows(skippedRows: Array<CsvImportSkippedRow>) {
  const counts = new Map<CsvImportSkipReason, number>()

  for (const row of skippedRows) {
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([reason, count]) => ({ reason, count }))
}

export function buildCsvImportPlan(params: {
  rows: Array<ParsedCsvImportRow>
  sets: Array<ImportSetSummary>
  products: Array<ImportProductSummary>
  skus: Array<ImportSkuSummary>
  existingLocations: Array<ImportLocationSummary>
}): CsvImportPlan {
  const setsByName = new Map<string, Array<ImportSetSummary>>()
  const setsByCode = new Map<string, Array<ImportSetSummary>>()
  const productsByKey = new Map<string, ImportProductSummary>()
  const productsByTcgplayerProductId = new Map<number, ImportProductSummary>()
  const skusByTcgplayerSku = new Map<number, ImportSkuSummary>()
  const existingLocationsByCode = new Map<string, ImportLocationSummary>()

  for (const set of params.sets) {
    const nameMatches = setsByName.get(set.name) ?? []
    nameMatches.push(set)
    setsByName.set(set.name, nameMatches)

    if (set.abbreviation) {
      const abbreviationMatches = setsByCode.get(set.abbreviation) ?? []
      abbreviationMatches.push(set)
      setsByCode.set(set.abbreviation, abbreviationMatches)
    }
  }

  for (const product of params.products) {
    productsByKey.set(product.key, product)
    productsByTcgplayerProductId.set(product.tcgplayerProductId, product)
  }

  for (const sku of params.skus) {
    skusByTcgplayerSku.set(sku.tcgplayerSku, sku)
  }

  for (const location of params.existingLocations) {
    existingLocationsByCode.set(location.code, location)
  }

  const matchedRows: Array<CsvImportAggregatedRow> = []
  const skippedRows: Array<CsvImportSkippedRow> = []
  const setTrackingCandidates = new Map<string, CsvImportSetToTrack>()

  for (const row of params.rows) {
    const location = buildLocationKey(row.remarks)
    if (!location) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId: row.skuId,
        reason: 'invalid_location_source',
        message: 'Remarks must contain a non-empty location value.',
      })
      continue
    }

    const existingLocation = existingLocationsByCode.get(location.code)
    if (
      existingLocation &&
      (!existingLocation.active || !existingLocation.acceptsContents)
    ) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId: row.skuId,
        reason: 'invalid_location_source',
        message: `Location ${location.code} exists but cannot receive inventory.`,
      })
      continue
    }

    const quantity = row.quantity
    if (quantity === undefined || !Number.isInteger(quantity) || quantity <= 0) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId: row.skuId,
        reason: 'invalid_quantity',
        message: 'Quantity must be a positive integer.',
      })
      continue
    }

    const set = resolveImportSetForRow(row, setsByName, setsByCode)
    if (!set) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId: row.skuId,
        reason: 'unknown_set',
        message: `Could not resolve catalog set ${row.setName}.`,
      })
      continue
    }

    if (!set.inRuleScope) {
      setTrackingCandidates.set(set.key, {
        setKey: set.key,
        setName: set.name,
      })
    }

    const skuId = row.skuId
    if (skuId === undefined || !Number.isInteger(skuId)) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        reason: 'unknown_sku',
        message: 'SKU Id is missing or invalid.',
      })
      continue
    }

    const sku = skusByTcgplayerSku.get(skuId)
    if (!sku) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId,
        reason: 'unknown_sku',
        message: `Catalog sku not found for TCGplayer SKU ${skuId}.`,
      })
      continue
    }

    if (sku.setKey !== set.key) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId,
        reason: 'sku_set_mismatch',
        message: `Resolved sku ${skuId} belongs to a different set.`,
      })
      continue
    }

    const product = productsByKey.get(sku.catalogProductKey)
    if (!product) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        setName: row.setName,
        name: row.name,
        skuId,
        reason: 'unknown_sku',
        message: `Catalog product is missing for sku ${skuId}.`,
      })
      continue
    }

    const productId = row.productId
    if (productId !== undefined) {
      const importedProduct = productsByTcgplayerProductId.get(productId)
      if (!importedProduct || importedProduct.key !== product.key) {
        skippedRows.push({
          rowNumber: row.rowNumber,
          setName: row.setName,
          name: row.name,
          skuId,
          reason: 'sku_product_mismatch',
          message: `Resolved sku ${skuId} does not match product ${productId}.`,
        })
        continue
      }
    }

    matchedRows.push({
      locationCode: location.code,
      locationDisplayName: location.displayName,
      catalogProductKey: product.key,
      catalogSkuKey: sku.key,
      quantity,
      setKey: set.key,
      setName: set.name,
      productName: product.cleanName || product.name,
    })
  }

  const aggregatedRows = aggregateMatchedImportRows(matchedRows)
  const locationsToCreate = [...new Map(
    matchedRows
      .filter((row) => !existingLocationsByCode.has(row.locationCode))
      .map((row) => [
        row.locationCode,
        {
          code: row.locationCode,
          displayName: row.locationDisplayName,
        },
      ]),
  ).values()].sort((left, right) => left.code.localeCompare(right.code))

  return {
    totalRows: params.rows.length,
    matchedRowCount: matchedRows.length,
    totalQuantity: matchedRows.reduce((sum, row) => sum + row.quantity, 0),
    aggregatedRows,
    locationsToCreate,
    setsToTrack: [...setTrackingCandidates.values()].sort((left, right) =>
      left.setName.localeCompare(right.setName),
    ),
    skippedRows,
  }
}

export const listCatalogSetMatchesForImport = internalQuery({
  args: {
    setNames: v.array(v.string()),
    setCodes: v.array(v.string()),
  },
  handler: async (ctx, { setNames, setCodes }) => {
    const byName = await Promise.all(
      [...new Set(setNames)]
        .filter((value) => value.trim().length > 0)
        .map(async (input) => ({
          input,
          matches: (await ctx.db
            .query('catalogSets')
            .withIndex('by_name', (q) => q.eq('name', input))
            .collect()).map((set) => ({
            key: set.key,
            name: set.name,
            abbreviation: set.abbreviation,
            inRuleScope: set.inRuleScope,
          })),
        })),
    )

    const byCode = await Promise.all(
      [...new Set(setCodes)]
        .filter((value) => value.trim().length > 0)
        .map(async (input) => ({
          input,
          matches: (await ctx.db
            .query('catalogSets')
            .withIndex('by_abbreviation', (q) => q.eq('abbreviation', input))
            .collect()).map((set) => ({
            key: set.key,
            name: set.name,
            abbreviation: set.abbreviation,
            inRuleScope: set.inRuleScope,
          })),
        })),
    )

    return {
      byName,
      byCode,
    }
  },
})

function chunkArray<T>(items: Array<T>, size: number) {
  const chunks: Array<Array<T>> = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

export const loadCatalogSkusForImport = internalQuery({
  args: {
    tcgplayerSkus: v.array(v.number()),
  },
  handler: async (ctx, { tcgplayerSkus }) => {
    const results: Array<{
      key: string
      setKey: string
      catalogProductKey: string
      tcgplayerSku: number
    }> = []

    for (const skuChunk of chunkArray([...new Set(tcgplayerSkus)], 200)) {
      const skus = await Promise.all(
        skuChunk.map(async (tcgplayerSku) =>
          await ctx.db
            .query('catalogSkus')
            .withIndex('by_tcgplayerSku', (q) => q.eq('tcgplayerSku', tcgplayerSku))
            .unique(),
        ),
      )

      results.push(
        ...skus
          .filter((sku): sku is NonNullable<(typeof skus)[number]> => sku !== null)
          .map((sku) => ({
            key: sku.key,
            setKey: sku.setKey,
            catalogProductKey: sku.catalogProductKey,
            tcgplayerSku: sku.tcgplayerSku,
          })),
      )
    }

    return {
      skus: results.map((sku) => ({
        key: sku.key,
        setKey: sku.setKey,
        catalogProductKey: sku.catalogProductKey,
        tcgplayerSku: sku.tcgplayerSku,
      })),
    }
  },
})

export const loadCatalogProductsForImport = internalQuery({
  args: {
    catalogProductKeys: v.array(v.string()),
    tcgplayerProductIds: v.array(v.number()),
  },
  handler: async (ctx, { catalogProductKeys, tcgplayerProductIds }) => {
    const productsByKey = new Map<
      string,
      {
        key: string
        setKey: string
        tcgplayerProductId: number
        name: string
        cleanName: string
      }
    >()

    for (const keyChunk of chunkArray([...new Set(catalogProductKeys)], 200)) {
      const products = await Promise.all(
        keyChunk.map(async (catalogProductKey) =>
          await ctx.db
            .query('catalogProducts')
            .withIndex('by_key', (q) => q.eq('key', catalogProductKey))
            .unique(),
        ),
      )

      for (const product of products) {
        if (!product) {
          continue
        }

        productsByKey.set(product.key, {
          key: product.key,
          setKey: product.setKey,
          tcgplayerProductId: product.tcgplayerProductId,
          name: product.name,
          cleanName: product.cleanName,
        })
      }
    }

    for (const idChunk of chunkArray([...new Set(tcgplayerProductIds)], 200)) {
      const products = await Promise.all(
        idChunk.map(async (tcgplayerProductId) =>
          await ctx.db
            .query('catalogProducts')
            .withIndex('by_tcgplayerProductId', (q) =>
              q.eq('tcgplayerProductId', tcgplayerProductId),
            )
            .unique(),
        ),
      )

      for (const product of products) {
        if (!product) {
          continue
        }

        productsByKey.set(product.key, {
          key: product.key,
          setKey: product.setKey,
          tcgplayerProductId: product.tcgplayerProductId,
          name: product.name,
          cleanName: product.cleanName,
        })
      }
    }

    return {
      products: [...productsByKey.values()],
    }
  },
})

export const listLocationsByCodes = internalQuery({
  args: {
    codes: v.array(v.string()),
  },
  handler: async (ctx, { codes }) => {
    const locations = await Promise.all(
      [...new Set(codes)]
        .filter((value) => value.trim().length > 0)
        .map(async (code) => await loadLocationByCode(ctx, code)),
    )

    return locations
      .filter((location): location is NonNullable<(typeof locations)[number]> => location !== null)
      .map((location) => ({
        _id: location._id,
        code: location.code,
        active: location.active,
        acceptsContents: location.acceptsContents,
        displayName: location.displayName,
      }))
  },
})

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
