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

export type { ImportSetSummary } from './readModels/importPlan'
export type {
  CsvImportAggregatedRow,
  CsvImportLocationToCreate,
  CsvImportPlan,
  CsvImportSetToTrack,
  CsvImportSkipReason,
  CsvImportSkippedRow,
} from './readModels/importPlan'
export {
  sanitizeImportLocationCode,
  resolveImportSetForRow,
  aggregateMatchedImportRows,
  summarizeSkippedRows,
  buildCsvImportPlan,
} from './readModels/importPlan'
export {
  listCatalogSetMatchesForImport,
  loadCatalogSkusForImport,
  loadCatalogProductsForImport,
  listLocationsByCodes,
} from './loaders/importLookups'
export {
  prepareCsvImportCommit,
  applyCsvImportReceiptsBatch,
} from './writers/importCommit'
