import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'
import { readMaterializedOrderShipmentState } from './shipmentSummary'
import type { Doc } from '../_generated/dataModel'
import type { OrderShipmentState } from './shipmentSummary'

type InventoryContentDoc = Doc<'inventoryLocationContents'>
type InventoryLocationDoc = Doc<'inventoryLocations'>

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

async function loadInventoryContentsBySkuKeys(
  ctx: { db: any },
  catalogSkuKeys: Array<string>,
) {
  const entries = await Promise.all(
    [...new Set(catalogSkuKeys)].map(async (catalogSkuKey) => {
      const contents = await ctx.db
        .query('inventoryLocationContents')
        .withIndex('by_catalogSkuKey', (q: any) => q.eq('catalogSkuKey', catalogSkuKey))
        .collect()

      return [catalogSkuKey, contents as Array<InventoryContentDoc>] as const
    }),
  )

  return new Map<string, Array<InventoryContentDoc>>(entries)
}

async function loadInventoryLocationsById(
  ctx: { db: any },
  locationIds: Iterable<InventoryContentDoc['locationId']>,
) {
  const entries = await Promise.all(
    [...new Set(locationIds)].map(async (locationId) => {
      const location = await ctx.db.get('inventoryLocations', locationId)
      return [locationId, location as InventoryLocationDoc | null] as const
    }),
  )

  return new Map<InventoryContentDoc['locationId'], InventoryLocationDoc | null>(entries)
}

function buildInventoryRowsForOrderItem(
  contents: Array<InventoryContentDoc>,
  locationsById: Map<InventoryContentDoc['locationId'], InventoryLocationDoc | null>,
) {
  return contents
    .flatMap((content) => {
      const location = locationsById.get(content.locationId)
      if (!location) {
        return []
      }

      return [
        {
          contentId: content._id,
          quantity: content.quantity,
          workflowStatus: content.workflowStatus,
          workflowTag: content.workflowTag,
          updatedAt: content.updatedAt,
          location: {
            _id: location._id,
            code: location.code,
            displayName: location.displayName,
            kind: location.kind,
            active: location.active,
          },
        },
      ]
    })
    .sort((left, right) => {
      const workflowRank = (workflowStatus: string) =>
        workflowStatus === 'available'
          ? 0
          : workflowStatus === 'processing'
            ? 1
            : 2

      return (
        workflowRank(left.workflowStatus) - workflowRank(right.workflowStatus) ||
        left.location.code.localeCompare(right.location.code) ||
        right.updatedAt - left.updatedAt
      )
    })
}

export const getPickContext = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get('orders', orderId)
    if (!order) {
      return null
    }

    const catalogSkuKeys = order.items
      .map((item) => item.catalogSkuKey)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)

    const contentsBySkuKey = await loadInventoryContentsBySkuKeys(ctx, catalogSkuKeys)
    const locationsById = await loadInventoryLocationsById(
      ctx,
      [...contentsBySkuKey.values()].flat().map((content) => content.locationId),
    )

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      channel: order.channel,
      customerName: order.customerName,
      isFulfilled: order.isFulfilled,
      totalAmountCents: order.totalAmountCents,
      itemCount: order.itemCount,
      createdAt: order.createdAt,
      items: order.items.map((item, itemIndex) => {
        const inventoryRows =
          typeof item.catalogSkuKey === 'string' && item.catalogSkuKey.length > 0
            ? buildInventoryRowsForOrderItem(
                contentsBySkuKey.get(item.catalogSkuKey) ?? [],
                locationsById,
              )
            : []

        return {
          itemIndex,
          ...item,
          inventory: {
            totalQuantity: inventoryRows.reduce((sum, row) => sum + row.quantity, 0),
            availableQuantity: inventoryRows.reduce(
              (sum, row) =>
                sum + (row.workflowStatus === 'available' ? row.quantity : 0),
              0,
            ),
            rowCount: inventoryRows.length,
            rows: inventoryRows,
          },
        }
      }),
    }
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
