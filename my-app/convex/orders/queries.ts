import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
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
)

type OrderListFilter =
  | 'all'
  | 'last7'
  | 'last30'
  | 'unfulfilled'

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
  cutoffTimestamp: number | undefined,
): number | undefined {
  switch (filter) {
    case 'last7':
    case 'last30':
      if (typeof cutoffTimestamp !== 'number' || !Number.isFinite(cutoffTimestamp)) {
        throw new Error(`cutoffTimestamp is required for ${filter} filters`)
      }
      return cutoffTimestamp
    default:
      return undefined
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
  cutoffTimestamp: number | undefined,
  paginationOpts: {
    numItems: number
    cursor: string | null
  },
) {
  if (filter === 'unfulfilled') {
    return await ctx.db
      .query('orders')
      .withIndex('by_fulfillmentStatus_createdAt', (q: any) =>
        q.eq('fulfillmentStatus', false),
      )
      .order('desc')
      .paginate(paginationOpts)
  }

  const cutoff = cutoffForFilter(filter, cutoffTimestamp)

  const queryHandle =
    typeof cutoff === 'number'
      ? ctx.db
          .query('orders')
          .withIndex('by_createdAt', (q: any) => q.gte('createdAt', cutoff))
      : ctx.db.query('orders').withIndex('by_createdAt')

  return await queryHandle.order('desc').paginate(paginationOpts)
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
    cutoffTimestamp: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { filter, cutoffTimestamp, paginationOpts }) => {
    const page = await listOrdersByCreatedAt(
      ctx,
      filter,
      cutoffTimestamp,
      paginationOpts,
    )
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
