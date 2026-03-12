import { v } from 'convex/values'
import { query } from '../../lib/auth'
import {
  loadInventoryContentsBySkuKeys,
  loadInventoryLocationsById,
} from '../loaders/pickInventory'
import type { Doc } from '../../_generated/dataModel'

type InventoryContentDoc = Doc<'inventoryLocationContents'>
type InventoryLocationDoc = Doc<'inventoryLocations'>

export function buildInventoryRowsForOrderItem(
  contents: Array<InventoryContentDoc>,
  locationsById: Map<
    InventoryContentDoc['locationId'],
    InventoryLocationDoc | null
  >,
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
        workflowRank(left.workflowStatus) -
          workflowRank(right.workflowStatus) ||
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
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )

    const contentsBySkuKey = await loadInventoryContentsBySkuKeys(
      ctx,
      catalogSkuKeys,
    )
    const locationsById = await loadInventoryLocationsById(
      ctx,
      [...contentsBySkuKey.values()]
        .flat()
        .map((content) => content.locationId),
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
          typeof item.catalogSkuKey === 'string' &&
          item.catalogSkuKey.length > 0
            ? buildInventoryRowsForOrderItem(
                contentsBySkuKey.get(item.catalogSkuKey) ?? [],
                locationsById,
              )
            : []

        return {
          itemIndex,
          ...item,
          inventory: {
            totalQuantity: inventoryRows.reduce(
              (sum, row) => sum + row.quantity,
              0,
            ),
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
