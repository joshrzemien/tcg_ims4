import {
  appendWorkflowBreakdown,
  buildContentAggregateKey,
  buildEmptyWorkflowBreakdown,
  buildInventoryAggregateRow,
  buildInventoryContentRow,
} from '../model'
import {
  loadLocationsById,
  loadProductsByKey,
  loadSetsByKey,
  loadSkusByKey,
  loadTrackedSeriesByProductKey,
  loadUnitDetailsByContentId,
} from './loaders'
import type { InventoryContentDoc } from './loaders'

type DbCtx = { db: any }

export async function hydrateInventoryContentRows(
  ctx: DbCtx,
  contents: Array<InventoryContentDoc>,
) {
  const productsByKey = await loadProductsByKey(
    ctx,
    contents.map((content) => content.catalogProductKey),
  )
  const skusByKey = await loadSkusByKey(
    ctx,
    contents
      .map((content) => content.catalogSkuKey)
      .filter((value): value is string => typeof value === 'string'),
  )
  const trackedSeriesByProductKey = await loadTrackedSeriesByProductKey(
    ctx,
    contents.map((content) => content.catalogProductKey),
  )
  const locationsById = await loadLocationsById(
    ctx,
    contents.map((content) => content.locationId),
  )
  const unitDetailsByContentId = await loadUnitDetailsByContentId(
    ctx,
    contents.map((content) => content._id),
  )
  const setsByKey = await loadSetsByKey(
    ctx,
    contents
      .map((content) => productsByKey.get(content.catalogProductKey)?.setKey)
      .filter((value): value is string => typeof value === 'string'),
  )

  return contents.flatMap((content) => {
    const product = productsByKey.get(content.catalogProductKey)
    const location = locationsById.get(content.locationId)

    if (!product || !location) {
      return []
    }

    const sku =
      typeof content.catalogSkuKey === 'string'
        ? skusByKey.get(content.catalogSkuKey) ?? null
        : null

    return [
      buildInventoryContentRow({
        content,
        location,
        product,
        sku,
        set: setsByKey.get(product.setKey) ?? null,
        trackedSeries: trackedSeriesByProductKey.get(product.key) ?? [],
        unitDetail: unitDetailsByContentId.get(content._id) ?? null,
      }),
    ]
  })
}

export async function buildInventoryAggregateRows(
  ctx: DbCtx,
  contents: Array<InventoryContentDoc>,
) {
  const aggregates = new Map<
    string,
    {
      aggregateKey: string
      inventoryClass: InventoryContentDoc['inventoryClass']
      catalogProductKey: string
      catalogSkuKey?: string
      totalQuantity: number
      distinctLocationIds: Set<InventoryContentDoc['locationId']>
      workflowBreakdown: ReturnType<typeof buildEmptyWorkflowBreakdown>
      latestUpdatedAt: number
      locationCodes: Set<string>
    }
  >()

  const locationsById = await loadLocationsById(
    ctx,
    contents.map((content) => content.locationId),
  )

  for (const content of contents) {
    const aggregateKey = buildContentAggregateKey({
      inventoryClass: content.inventoryClass,
      catalogProductKey: content.catalogProductKey,
      catalogSkuKey: content.catalogSkuKey,
    })
    const location = locationsById.get(content.locationId)
    const existing =
      aggregates.get(aggregateKey) ??
      {
        aggregateKey,
        inventoryClass: content.inventoryClass,
        catalogProductKey: content.catalogProductKey,
        ...(content.catalogSkuKey ? { catalogSkuKey: content.catalogSkuKey } : {}),
        totalQuantity: 0,
        distinctLocationIds: new Set<InventoryContentDoc['locationId']>(),
        workflowBreakdown: buildEmptyWorkflowBreakdown(),
        latestUpdatedAt: 0,
        locationCodes: new Set<string>(),
      }

    existing.totalQuantity += content.quantity
    existing.distinctLocationIds.add(content.locationId)
    appendWorkflowBreakdown(
      existing.workflowBreakdown,
      content.workflowStatus,
      content.quantity,
    )
    existing.latestUpdatedAt = Math.max(existing.latestUpdatedAt, content.updatedAt)
    if (location) {
      existing.locationCodes.add(location.code)
    }
    aggregates.set(aggregateKey, existing)
  }

  const aggregateValues = [...aggregates.values()]
  const productsByKey = await loadProductsByKey(
    ctx,
    aggregateValues.map((aggregate) => aggregate.catalogProductKey),
  )
  const skusByKey = await loadSkusByKey(
    ctx,
    aggregateValues
      .map((aggregate) => aggregate.catalogSkuKey)
      .filter((value): value is string => typeof value === 'string'),
  )
  const trackedSeriesByProductKey = await loadTrackedSeriesByProductKey(
    ctx,
    aggregateValues.map((aggregate) => aggregate.catalogProductKey),
  )
  const setsByKey = await loadSetsByKey(
    ctx,
    aggregateValues
      .map((aggregate) => productsByKey.get(aggregate.catalogProductKey)?.setKey)
      .filter((value): value is string => typeof value === 'string'),
  )

  return aggregateValues
    .flatMap((aggregate) => {
      const product = productsByKey.get(aggregate.catalogProductKey)
      if (!product) {
        return []
      }

      const sku =
        typeof aggregate.catalogSkuKey === 'string'
          ? skusByKey.get(aggregate.catalogSkuKey) ?? null
          : null

      return [
        buildInventoryAggregateRow({
          aggregate,
          product,
          sku,
          set: setsByKey.get(product.setKey) ?? null,
          trackedSeries: trackedSeriesByProductKey.get(product.key) ?? [],
        }),
      ]
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
}
