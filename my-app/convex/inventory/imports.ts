'use node'

import { parse as parseCsv } from 'csv-parse/sync'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { action } from '../_generated/server'
import { chunkArray, dedupeByKey } from '../lib/collections'
import {
  CSV_IMPORT_PREVIEW_SAMPLE_LIMIT,
  CSV_IMPORT_REQUIRED_HEADERS,
  CSV_IMPORT_WRITE_BATCH_SIZE,
  buildCsvImportPlan,
  resolveImportSetForRow,
  sanitizeImportLocationCode,
  summarizeSkippedRows,
} from './importsSupport'
import type { Id } from '../_generated/dataModel'
import type {
  CsvImportAggregatedRow,
  CsvImportPlan,
  ImportSetSummary,
} from './importsSupport'

function normalizeHeader(value: string | undefined) {
  return (value ?? '').trim()
}

function normalizeCell(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseOptionalInteger(value: string): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return undefined
  }

  return parsed
}

export function assertCsvImportHeaders(headers: Array<string>) {
  const normalizedHeaders = headers.map(normalizeHeader)
  const missingHeaders = CSV_IMPORT_REQUIRED_HEADERS.filter(
    (header) => !normalizedHeaders.includes(header),
  )

  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV is missing required headers: ${missingHeaders.join(', ')}`,
    )
  }
}

function extractCsvImportHeaders(text: string) {
  const headerRows = parseCsv(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
    to_line: 1,
  }) as Array<Array<string>>

  if (headerRows.length === 0 || headerRows[0].length === 0) {
    throw new Error('CSV is empty')
  }

  return headerRows[0].map((value) =>
    typeof value === 'string' ? value.trim() : '',
  )
}

export function parseCsvImportRows(text: string) {
  assertCsvImportHeaders(extractCsvImportHeaders(text))

  const rows = parseCsv(text, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as Array<Record<string, unknown>>

  return rows
    .filter((row) =>
      Object.values(row).some((value) => normalizeCell(value).length > 0),
    )
    .map((row, index) => ({
      rowNumber: index + 2,
      setName: normalizeCell(row.Set),
      setCode: normalizeCell(row['Set Code']) || undefined,
      name: normalizeCell(row.Name),
      quantity: parseOptionalInteger(normalizeCell(row.Quantity)),
      remarks: normalizeCell(row.Remarks),
      skuId: parseOptionalInteger(normalizeCell(row['SKU Id'])),
      productId: parseOptionalInteger(normalizeCell(row['ID Product'])),
      printing: normalizeCell(row.Printing),
      condition: normalizeCell(row.Condition),
      language: normalizeCell(row.Language),
    }))
}

async function loadCsvImportPlan(
  ctx: {
    storage: {
      get: (storageId: Id<'_storage'>) => Promise<Blob | null>
      delete: (storageId: Id<'_storage'>) => Promise<void>
      generateUploadUrl: () => Promise<string>
    }
    runQuery: (queryRef: any, args: Record<string, unknown>) => Promise<any>
  },
  storageId: Id<'_storage'>,
): Promise<CsvImportPlan> {
  const blob = await ctx.storage.get(storageId)
  if (!blob) {
    throw new Error(`Uploaded file not found: ${storageId}`)
  }

  const text = await blob.text()
  const rows = parseCsvImportRows(text)

  const setNames = [...new Set(rows.map((row) => row.setName).filter(Boolean))]
  const setCodes = [
    ...new Set(
      rows
        .map((row) => row.setCode)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  ]

  const setMatches: {
    byName: Array<{ input: string; matches: Array<ImportSetSummary> }>
    byCode: Array<{ input: string; matches: Array<ImportSetSummary> }>
  } = await ctx.runQuery(
    internal.inventory.importsSupport.listCatalogSetMatchesForImport,
    {
      setNames,
      setCodes,
    },
  )

  const sets = [
    ...new Map(
      [...setMatches.byName, ...setMatches.byCode]
        .flatMap((entry) => entry.matches)
        .map((set) => [set.key, set]),
    ).values(),
  ]

  const setsByName = new Map(
    setMatches.byName.map((entry) => [entry.input, entry.matches]),
  )
  const setsByCode = new Map(
    setMatches.byCode.map((entry) => [entry.input, entry.matches]),
  )
  const resolvedRows = rows
    .map((row) => ({
      row,
      set: resolveImportSetForRow(row, setsByName, setsByCode),
    }))
    .filter((entry) => entry.set !== null)

  const skuIds = [
    ...new Set(
      resolvedRows
        .map(({ row }) => row.skuId)
        .filter((value): value is number => typeof value === 'number'),
    ),
  ]

  const skuData = {
    skus: dedupeByKey(
      (
        await Promise.all(
          chunkArray(skuIds, 2000).map(async (tcgplayerSkus) => {
            const result: {
              skus: Array<{
                key: string
                setKey: string
                catalogProductKey: string
                tcgplayerSku: number
              }>
            } = await ctx.runQuery(
              internal.inventory.importsSupport.loadCatalogSkusForImport,
              {
                tcgplayerSkus,
              },
            )

            return result.skus
          }),
        )
      ).flat(),
      (sku) => sku.key,
    ),
  }

  const catalogProductKeys = [
    ...new Set(skuData.skus.map((sku) => sku.catalogProductKey)),
  ]
  const tcgplayerProductIds = [
    ...new Set(
      resolvedRows
        .map(({ row }) => row.productId)
        .filter((value): value is number => typeof value === 'number'),
    ),
  ]

  const productData = {
    products: dedupeByKey(
      (
        await Promise.all([
          ...chunkArray(catalogProductKeys, 2000).map(async (productKeysChunk) => {
            const result: {
              products: Array<{
                key: string
                setKey: string
                tcgplayerProductId: number
                name: string
                cleanName: string
              }>
            } = await ctx.runQuery(
              internal.inventory.importsSupport.loadCatalogProductsForImport,
              {
                catalogProductKeys: productKeysChunk,
                tcgplayerProductIds: [],
              },
            )

            return result.products
          }),
          ...chunkArray(tcgplayerProductIds, 2000).map(async (productIdsChunk) => {
            const result: {
              products: Array<{
                key: string
                setKey: string
                tcgplayerProductId: number
                name: string
                cleanName: string
              }>
            } = await ctx.runQuery(
              internal.inventory.importsSupport.loadCatalogProductsForImport,
              {
                catalogProductKeys: [],
                tcgplayerProductIds: productIdsChunk,
              },
            )

            return result.products
          }),
        ])
      ).flat(),
      (product) => product.key,
    ),
  }

  const locationCodes = [
    ...new Set(
      rows
        .map((row) => sanitizeImportLocationCode(row.remarks))
        .filter((value): value is string => typeof value === 'string'),
    ),
  ]

  const existingLocations = dedupeByKey(
    (
      await Promise.all(
        chunkArray(locationCodes, 2000).map(async (codes) => {
          const result: Array<{
            _id: Id<'inventoryLocations'>
            code: string
            active: boolean
            acceptsContents: boolean
            displayName?: string
          }> = await ctx.runQuery(
            internal.inventory.importsSupport.listLocationsByCodes,
            {
              codes,
            },
          )

          return result
        }),
      )
    ).flat(),
    (location) => location.code,
  )

  return buildCsvImportPlan({
    rows,
    sets,
    products: productData.products,
    skus: skuData.skus,
    existingLocations,
  })
}

export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const discardUpload = action({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId)
    return true
  },
})

export const previewCsvUpload = action({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { storageId }) => {
    const plan = await loadCsvImportPlan(ctx, storageId)

    return {
      totalRows: plan.totalRows,
      matchedRows: plan.matchedRowCount,
      skippedRows: plan.skippedRows.length,
      aggregatedRows: plan.aggregatedRows.length,
      totalQuantity: plan.totalQuantity,
      locationsToCreate: plan.locationsToCreate,
      setsToTrack: plan.setsToTrack,
      skippedReasonCounts: summarizeSkippedRows(plan.skippedRows),
      skippedRowSamples: plan.skippedRows.slice(0, CSV_IMPORT_PREVIEW_SAMPLE_LIMIT),
      aggregatedRowSamples: plan.aggregatedRows.slice(
        0,
        CSV_IMPORT_PREVIEW_SAMPLE_LIMIT,
      ),
    }
  },
})

export const commitCsvUpload = action({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { storageId }) => {
    const plan = await loadCsvImportPlan(ctx, storageId)

    const preparation: {
      locationIdsByCode: Record<string, Id<'inventoryLocations'>>
      createdLocationCount: number
      createdRuleCount: number
      reactivatedRuleCount: number
    } = await ctx.runMutation(
      internal.inventory.importsSupport.prepareCsvImportCommit,
      {
        locationCodes: [
          ...new Set(plan.aggregatedRows.map((row) => row.locationCode)),
        ],
        locationsToCreate: plan.locationsToCreate,
        setKeysToTrack: plan.setsToTrack.map((set) => set.setKey),
      },
    )

    let importedContentRows = 0
    let receivedQuantity = 0

    for (const batch of chunkArray(plan.aggregatedRows, CSV_IMPORT_WRITE_BATCH_SIZE)) {
      const result: {
        appliedRows: number
        receivedQuantity: number
      } = await ctx.runMutation(
        internal.inventory.importsSupport.applyCsvImportReceiptsBatch,
        {
          rows: batch.map((row: CsvImportAggregatedRow) => {
            const locationId = preparation.locationIdsByCode[row.locationCode]
            if (!locationId) {
              throw new Error(
                `Import location was not prepared for code ${row.locationCode}`,
              )
            }

            return {
              locationId,
              catalogProductKey: row.catalogProductKey,
              catalogSkuKey: row.catalogSkuKey,
              quantity: row.quantity,
            }
          }),
        },
      )

      importedContentRows += result.appliedRows
      receivedQuantity += result.receivedQuantity
    }

    await ctx.storage.delete(storageId)

    return {
      totalRows: plan.totalRows,
      matchedRows: plan.matchedRowCount,
      skippedRows: plan.skippedRows.length,
      importedContentRows,
      receivedQuantity,
      createdLocationCount: preparation.createdLocationCount,
      createdRuleCount: preparation.createdRuleCount,
      reactivatedRuleCount: preparation.reactivatedRuleCount,
      skippedReasonCounts: summarizeSkippedRows(plan.skippedRows),
      skippedRowSamples: plan.skippedRows.slice(0, CSV_IMPORT_PREVIEW_SAMPLE_LIMIT),
    }
  },
})
