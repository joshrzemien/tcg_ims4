import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'
import { readMaterializedOrderShipmentState } from './shipmentSummary'
import type { Doc } from '../_generated/dataModel'
import type { OrderShipmentState } from './shipmentSummary'

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
  | 'isFulfilled'
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

function buildOrderListRow(
  order: OrderListSource,
  shipmentState: OrderShipmentState,
) {
  return {
    _id: order._id,
    externalId: order.externalId,
    orderNumber: order.orderNumber,
    channel: order.channel,
    customerName: order.customerName,
    isFulfilled: order.isFulfilled,
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
      .withIndex('by_isFulfilled_createdAt', (q: any) =>
        q.eq('isFulfilled', false),
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
    const pageRows = page.page.map((order: Doc<'orders'>) =>
      buildOrderListRow(order, readMaterializedOrderShipmentState(order)),
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

export const listWindowPage = internalQuery({
  args: {
    fromCreatedAt: v.number(),
    toCreatedAt: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { fromCreatedAt, toCreatedAt, paginationOpts }) => {
    return await ctx.db
      .query('orders')
      .withIndex('by_createdAt', (q: any) =>
        q.gte('createdAt', fromCreatedAt).lte('createdAt', toCreatedAt),
      )
      .order('desc')
      .paginate(paginationOpts)
  },
})
