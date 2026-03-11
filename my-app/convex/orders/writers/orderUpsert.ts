import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import {
  
  distinctCatalogLookupKeys,
  enrichOrderItemsWithCatalogLinks,
  loadCatalogLookupMaps
} from '../loaders/catalogLinks'
import { buildOrderShipmentState } from '../shipmentSummary'
import type {CatalogLookupMaps} from '../loaders/catalogLinks';
import type { Doc, Id } from '../../_generated/dataModel'
import type { DbCtx, DbWriterCtx } from '../../lib/ctx'
import type { OrderRecord } from '../types'

export async function shipmentsForOrder(
  ctx: DbCtx,
  orderId: Id<'orders'>,
): Promise<Array<Doc<'shipments'>>> {
  return await ctx.db
    .query('shipments')
    .withIndex('by_orderId', (q: any) => q.eq('orderId', orderId))
    .collect()
}

export async function upsertSingleOrder(
  ctx: DbWriterCtx,
  order: OrderRecord,
) {
  const lookupMaps = await loadCatalogLookupMaps(
    ctx,
    distinctCatalogLookupKeys(order.items),
  )
  await upsertSingleOrderWithCatalogLinks(ctx, order, lookupMaps)
}

export async function upsertSingleOrderWithCatalogLinks(
  ctx: DbWriterCtx,
  order: OrderRecord,
  lookupMaps: CatalogLookupMaps,
) {
  const { status: _ignoredStatus, ...orderRecord } = order
  const enrichedItems = enrichOrderItemsWithCatalogLinks(orderRecord.items, lookupMaps)

  const existing = await ctx.db
    .query('orders')
    .withIndex('by_externalId', (q: any) =>
      q.eq('externalId', orderRecord.externalId),
    )
    .unique()

  if (existing) {
    const orderShipments = await shipmentsForOrder(ctx, existing._id)
    const shipmentState = buildOrderShipmentState({
      order: orderRecord,
      shipments: orderShipments,
    })
    const nextIsFulfilled =
      typeof orderRecord.isFulfilled === 'boolean'
        ? orderRecord.isFulfilled
        : existing.isFulfilled

    await ctx.db.patch('orders', existing._id, {
      ...orderRecord,
      items: enrichedItems,
      ...shipmentState,
      isFulfilled: nextIsFulfilled,
    })
    return
  }

  const shipmentState = buildOrderShipmentState({
    order: orderRecord,
    shipments: [],
  })

  await ctx.db.insert('orders', {
    ...orderRecord,
    items: enrichedItems,
    ...shipmentState,
    isFulfilled:
      typeof orderRecord.isFulfilled === 'boolean'
        ? orderRecord.isFulfilled
        : false,
  })
}

export const upsertOrder = internalMutation({
  args: { order: v.any() },
  handler: async (ctx, { order }) => {
    await upsertSingleOrder(ctx, order)
  },
})

export const upsertOrdersBatch = internalMutation({
  args: { orders: v.array(v.any()) },
  handler: async (ctx, { orders }) => {
    const lookupMaps = await loadCatalogLookupMaps(
      ctx,
      distinctCatalogLookupKeys(orders),
    )

    for (const order of orders) {
      await upsertSingleOrderWithCatalogLinks(ctx, order, lookupMaps)
    }
  },
})
