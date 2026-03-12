import { v } from 'convex/values'
import { action } from '../lib/auth'
import { api, internal } from '../_generated/api'
import { DEFAULT_PRINTER_STATION_KEY } from '../../shared/printing'
import {
  exportTcgplayerPackingSlips,
  exportTcgplayerPullSheets,
} from './sources/tcgplayer'
import type { ActionCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

type OrderDoc = Doc<'orders'>

type ExportDocumentResult = {
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
  fileName: string
  mimeType: string
  orderCount: number
}

function normalizeBase64DocumentData(base64Data: string) {
  let normalizedBase64Data = base64Data.trim()
  let mimeType: string | undefined

  const dataUrlMatch = normalizedBase64Data.match(
    /^data:([^;,]+)?;base64,([\s\S]+)$/i,
  )
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1]
    normalizedBase64Data = dataUrlMatch[2]
  }

  normalizedBase64Data = normalizedBase64Data
    .replace(/\s+/g, '')
    .replaceAll('-', '+')
    .replaceAll('_', '/')

  const paddingRemainder = normalizedBase64Data.length % 4
  if (paddingRemainder === 1) {
    throw new Error('TCGplayer returned an invalid document encoding.')
  }
  if (paddingRemainder > 1) {
    normalizedBase64Data = normalizedBase64Data.padEnd(
      normalizedBase64Data.length + (4 - paddingRemainder),
      '=',
    )
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(normalizedBase64Data)) {
    throw new Error('TCGplayer returned a document in an unexpected format.')
  }

  return { normalizedBase64Data, mimeType }
}

function decodeBase64Document(base64Data: string, mimeType: string): Blob {
  const normalized = normalizeBase64DocumentData(base64Data)
  const binary = globalThis.atob(normalized.normalizedBase64Data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: normalized.mimeType ?? mimeType })
}

function formatTimestampForFileName(value: number): string {
  return new Date(value).toISOString().replaceAll(':', '').replaceAll('.', '')
}

function buildFallbackFileName(
  prefix: string,
  orderCount: number,
  mimeType: string,
): string {
  const lowerMimeType = mimeType.toLowerCase()
  const extension = lowerMimeType.includes('csv')
    ? 'csv'
    : lowerMimeType.includes('pdf')
      ? 'pdf'
      : 'bin'

  return `${prefix}-${orderCount}-orders-${formatTimestampForFileName(Date.now())}.${extension}`
}

async function loadOrders(
  ctx: ActionCtx,
  orderIds: Array<Id<'orders'>>,
): Promise<Array<OrderDoc>> {
  const orders = await Promise.all(
    orderIds.map((orderId) =>
      ctx.runQuery(api.orders.queries.getById, { orderId }),
    ),
  )

  const missingIds = orderIds.filter((_, index) => !orders[index])
  if (missingIds.length > 0) {
    throw new Error(`Order not found: ${missingIds[0]}`)
  }

  return orders as Array<OrderDoc>
}

function filterTcgplayerOrders(
  orders: Array<OrderDoc>,
  label: string,
): Array<OrderDoc> {
  const tcgplayerOrders = orders.filter(
    (order) => order.channel === 'tcgplayer',
  )

  if (tcgplayerOrders.length === 0) {
    throw new Error(`Select at least one TCGplayer order to export ${label}.`)
  }

  return tcgplayerOrders
}

function requireValidTimezoneOffset(timezoneOffset: number) {
  if (!Number.isFinite(timezoneOffset) || Math.abs(timezoneOffset) > 14) {
    throw new Error(`Invalid timezone offset: ${timezoneOffset}`)
  }
}

async function enqueueStoredDocumentJob(
  ctx: ActionCtx,
  args: {
    jobType: Doc<'printJobs'>['jobType']
    orderIds: Array<Id<'orders'>>
    orderNumbers: Array<string>
    base64Data: string
    fileName: string
    mimeType: string
  },
): Promise<ExportDocumentResult> {
  const blob = decodeBase64Document(args.base64Data, args.mimeType)
  const storageId = await ctx.storage.store(blob)
  const printDispatch = await ctx.runMutation(
    internal.printing.mutations.enqueueJob,
    {
      stationKey: DEFAULT_PRINTER_STATION_KEY,
      jobType: args.jobType,
      sourceKind: 'stored_document',
      storageId,
      fileName: args.fileName,
      mimeType: blob.type || args.mimeType,
      copies: 1,
      dedupeKey: `${args.jobType}:${[...args.orderIds].sort().join(',')}:${args.fileName}`,
      orderIds: args.orderIds,
      metadata: {
        orderCount: args.orderNumbers.length,
      },
    },
  )

  return {
    ...printDispatch,
    fileName: args.fileName,
    mimeType: blob.type || args.mimeType,
    orderCount: args.orderNumbers.length,
  }
}

export const exportPullSheets = action({
  args: {
    orderIds: v.array(v.id('orders')),
    timezoneOffset: v.number(),
  },
  handler: async (
    ctx,
    { orderIds, timezoneOffset },
  ): Promise<ExportDocumentResult> => {
    if (orderIds.length === 0) {
      throw new Error('Select at least one order to export pull sheets.')
    }

    requireValidTimezoneOffset(timezoneOffset)

    const orders = filterTcgplayerOrders(
      await loadOrders(ctx, orderIds),
      'Pull sheets',
    )
    const orderNumbers = orders.map((order) => order.orderNumber)
    const base64Data = await exportTcgplayerPullSheets({
      orderNumbers,
      timezoneOffset,
    })
    const fileName =
      base64Data.fileName ??
      buildFallbackFileName(
        'tcgplayer-pull-sheets',
        orderNumbers.length,
        base64Data.mimeType,
      )

    return await enqueueStoredDocumentJob(ctx, {
      jobType: 'pull_sheet',
      orderIds: orders.map((order) => order._id),
      orderNumbers,
      base64Data: base64Data.base64Data,
      fileName,
      mimeType: base64Data.mimeType,
    })
  },
})

export const exportPackingSlips = action({
  args: {
    orderIds: v.array(v.id('orders')),
    timezoneOffset: v.number(),
  },
  handler: async (
    ctx,
    { orderIds, timezoneOffset },
  ): Promise<ExportDocumentResult> => {
    if (orderIds.length === 0) {
      throw new Error('Select at least one order to export packing slips.')
    }

    requireValidTimezoneOffset(timezoneOffset)

    const orders = filterTcgplayerOrders(
      await loadOrders(ctx, orderIds),
      'Packing slips',
    )
    const orderNumbers = orders.map((order) => order.orderNumber)
    const base64Data = await exportTcgplayerPackingSlips({
      orderNumbers,
      timezoneOffset,
    })
    const fileName =
      base64Data.fileName ??
      buildFallbackFileName(
        'tcgplayer-packing-slips',
        orderNumbers.length,
        base64Data.mimeType,
      )

    return await enqueueStoredDocumentJob(ctx, {
      jobType: 'packing_slip',
      orderIds: orders.map((order) => order._id),
      orderNumbers,
      base64Data: base64Data.base64Data,
      fileName,
      mimeType: base64Data.mimeType,
    })
  },
})
