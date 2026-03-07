import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { normalizeShippingStatus } from '../utils/shippingStatus'
import { query } from '../_generated/server'
import {
  buildOrderShipmentState,
  hasMaterializedOrderShipmentState,
  readMaterializedOrderShipmentState,
} from './shipmentSummary'
import type { Doc } from '../_generated/dataModel'

const orderListFilterValidator = v.union(
  v.literal('all'),
  v.literal('last7'),
  v.literal('last30'),
  v.literal('unfulfilled'),
  v.literal('not_delivered'),
)

type OrderListFilter =
  | 'all'
  | 'last7'
  | 'last30'
  | 'unfulfilled'
  | 'not_delivered'

type OrderListSource = Pick<
  Doc<'orders'>,
  | '_id'
  | 'externalId'
  | 'orderNumber'
  | 'channel'
  | 'customerName'
  | 'fulfillmentStatus'
  | 'shippingStatus'
  | 'shippingAddress'
  | 'totalAmountCents'
  | 'itemCount'
  | 'createdAt'
  | 'updatedAt'
  | 'trackingPublicUrl'
  | 'shipmentCount'
  | 'reviewShipmentCount'
  | 'activeShipment'
  | 'latestShipment'
>
export type OrderListRow = ReturnType<typeof buildOrderListRow>

function cutoffForFilter(
  filter: OrderListFilter,
  now: number,
): number | undefined {
  switch (filter) {
    case 'last7':
      return now - 7 * 24 * 60 * 60 * 1000
    case 'last30':
      return now - 30 * 24 * 60 * 60 * 1000
    default:
      return undefined
  }
}

function matchesOrderFilter(
  order: Pick<Doc<'orders'>, 'createdAt' | 'fulfillmentStatus' | 'shippingStatus'>,
  filter: OrderListFilter,
  now: number,
) {
  switch (filter) {
    case 'all':
      return true
    case 'last7':
      return order.createdAt >= now - 7 * 24 * 60 * 60 * 1000
    case 'last30':
      return order.createdAt >= now - 30 * 24 * 60 * 60 * 1000
    case 'unfulfilled':
      return order.fulfillmentStatus !== true
    case 'not_delivered':
      return normalizeShippingStatus(order.shippingStatus) !== 'delivered'
    default:
      return true
  }
}

function buildOrderListRow(order: OrderListSource, shipmentState: ReturnType<typeof buildOrderShipmentState>) {
  return {
    _id: order._id,
    externalId: order.externalId,
    orderNumber: order.orderNumber,
    channel: order.channel,
    customerName: order.customerName,
    fulfillmentStatus: order.fulfillmentStatus,
    shippingAddress: order.shippingAddress,
    totalAmountCents: order.totalAmountCents,
    itemCount: order.itemCount,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    ...shipmentState,
  }
}

async function listOrdersByCreatedAt(
  ctx: { db: any },
  filter: OrderListFilter,
  paginationOpts: {
    numItems: number
    cursor: string | null
  },
) {
  const now = Date.now()
  const cutoff = cutoffForFilter(filter, now)

  if (filter === 'all' || typeof cutoff === 'number') {
    const queryHandle =
      typeof cutoff === 'number'
        ? ctx.db
            .query('orders')
            .withIndex('by_createdAt', (q: any) => q.gte('createdAt', cutoff))
        : ctx.db.query('orders').withIndex('by_createdAt')

    return await queryHandle.order('desc').paginate(paginationOpts)
  }

  const page: Array<Doc<'orders'>> = []
  let cursor = paginationOpts.cursor
  let isDone = false

  while (page.length < paginationOpts.numItems && !isDone) {
    const chunk = await ctx.db
      .query('orders')
      .withIndex('by_createdAt')
      .order('desc')
      .paginate({
        ...paginationOpts,
        cursor,
        numItems: Math.max(paginationOpts.numItems * 3, 50),
      })

    for (const order of chunk.page) {
      if (!matchesOrderFilter(order, filter, now)) {
        continue
      }

      page.push(order)
      if (page.length >= paginationOpts.numItems) {
        break
      }
    }

    cursor = chunk.continueCursor
    isDone = chunk.isDone
  }

  return {
    page,
    continueCursor: cursor ?? '',
    isDone,
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('orders').collect()
  },
})

export const listPage = query({
  args: {
    filter: orderListFilterValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { filter, paginationOpts }) => {
    const page = await listOrdersByCreatedAt(ctx, filter, paginationOpts)
    const pageRows = await Promise.all(
      page.page.map(async (order: Doc<'orders'>) => {
        if (hasMaterializedOrderShipmentState(order)) {
          return buildOrderListRow(order, readMaterializedOrderShipmentState(order))
        }

        const shipments = await ctx.db
          .query('shipments')
          .withIndex('by_orderId', (q) => q.eq('orderId', order._id))
          .collect()

        return buildOrderListRow(order, buildOrderShipmentState({
          order,
          shipments,
        }))
      }),
    )

    return {
      ...page,
      page: pageRows,
    }
  },
})

export const getById = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, { orderId }) => {
    return await ctx.db.get('orders', orderId)
  },
})
