import type { useQuery } from 'convex/react'
import type { api } from '../../../convex/_generated/api'

export type InventoryClass = 'single' | 'sealed' | 'graded'
export type InventoryView = 'aggregate' | 'location'
export type WorkflowStatus = 'available' | 'processing' | 'hold'

export type CsvImportPreview = {
  totalRows: number
  matchedRows: number
  skippedRows: number
  aggregatedRows: number
  totalQuantity: number
  locationsToCreate: Array<{
    code: string
    displayName: string
  }>
  setsToTrack: Array<{
    setKey: string
    setName: string
  }>
  skippedReasonCounts: Array<{
    reason: string
    count: number
  }>
  skippedRowSamples: Array<{
    rowNumber: number
    setName: string
    name: string
    skuId?: number
    reason: string
    message: string
  }>
  aggregatedRowSamples: Array<{
    locationCode: string
    catalogProductKey: string
    catalogSkuKey: string
    quantity: number
    setName: string
    productName: string
  }>
}

type AggregateRowsResult = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.stock.listAggregateByClass>>
>
export type AggregateRow = AggregateRowsResult[number]

export type AggregateSummary = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.stock.getAggregateSummary>>
>

export type LocationRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.locations.listAssignable>>
>[number]

type ContentRowsResult = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.contents.listByLocation>>
>
export type ContentRow = ContentRowsResult[number]
