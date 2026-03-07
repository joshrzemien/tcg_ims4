import { v } from 'convex/values'
import { action } from '../_generated/server'
import { api } from '../_generated/api'
import {
  exportTcgplayerPackingSlips,
  exportTcgplayerPullSheets,
} from './sources/tcgplayer'
import type { ActionCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

type OrderDoc = Doc<'orders'>

type ExportDocumentResult = {
  base64Data: string
  fileName: string
  mimeType: string
  orderCount: number
}

function formatTimestampForFileName(value: number): string {
  return new Date(value)
    .toISOString()
    .replaceAll(':', '')
    .replaceAll('.', '')
}

function buildFallbackFileName(
  prefix: string,
  orderCount: number,
  mimeType: string,
): string {
  const lowerMimeType = mimeType.toLowerCase()
  const extension =
    lowerMimeType.includes('csv')
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
    orderIds.map((orderId) => ctx.runQuery(api.orders.queries.getById, { orderId })),
  )

  const missingIds = orderIds.filter((_, index) => !orders[index])
  if (missingIds.length > 0) {
    throw new Error(`Order not found: ${missingIds[0]}`)
  }

  return orders as Array<OrderDoc>
}

function filterTcgplayerOrders(orders: Array<OrderDoc>, label: string): Array<OrderDoc> {
  const tcgplayerOrders = orders.filter((order) => order.channel === 'tcgplayer')

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

export const exportPullSheets = action({
  args: {
    orderIds: v.array(v.id('orders')),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, { orderIds, timezoneOffset }): Promise<ExportDocumentResult> => {
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

    return {
      base64Data: base64Data.base64Data,
      fileName:
        base64Data.fileName ??
        buildFallbackFileName(
          'tcgplayer-pull-sheets',
          orderNumbers.length,
          base64Data.mimeType,
        ),
      mimeType: base64Data.mimeType,
      orderCount: orderNumbers.length,
    }
  },
})

export const exportPackingSlips = action({
  args: {
    orderIds: v.array(v.id('orders')),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, { orderIds, timezoneOffset }): Promise<ExportDocumentResult> => {
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

    return {
      base64Data: base64Data.base64Data,
      fileName:
        base64Data.fileName ??
        buildFallbackFileName(
          'tcgplayer-packing-slips',
          orderNumbers.length,
          base64Data.mimeType,
        ),
      mimeType: base64Data.mimeType,
      orderCount: orderNumbers.length,
    }
  },
})
