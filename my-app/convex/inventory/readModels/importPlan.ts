import type { Doc } from '../../_generated/dataModel'
import type { ParsedCsvImportRow } from '../importsSupport'

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

export type CsvImportSkipReason =
  | 'unknown_set'
  | 'unknown_sku'
  | 'sku_set_mismatch'
  | 'sku_product_mismatch'
  | 'invalid_quantity'
  | 'invalid_location_source'

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
