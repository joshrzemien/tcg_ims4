import { normalizeOptionalString } from './validation'
import type { Id } from '../../_generated/dataModel'
import type { InventoryClass } from './types'

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${fieldName} is required`)
  }

  return normalized
}

export function buildContentAggregateKey(params: {
  inventoryClass: InventoryClass
  catalogProductKey: string
  catalogSkuKey?: string
}) {
  return [
    params.inventoryClass,
    normalizeRequiredString(params.catalogProductKey, 'catalogProductKey'),
    normalizeOptionalString(params.catalogSkuKey) ?? '_',
  ].join('|')
}

export function buildCatalogContentIdentityKey(params: {
  locationId: Id<'inventoryLocations'>
  inventoryClass: InventoryClass
  catalogProductKey: string
  catalogSkuKey?: string
}) {
  return [
    'catalog',
    params.locationId,
    params.inventoryClass,
    normalizeRequiredString(params.catalogProductKey, 'catalogProductKey'),
    normalizeOptionalString(params.catalogSkuKey) ?? '_',
  ].join('|')
}

export function buildPendingGradedContentIdentityKey(
  contentId: Id<'inventoryLocationContents'>,
) {
  return ['graded', 'pending', contentId].join('|')
}

export function buildUnitIdentityKey(params: {
  gradingCompany: string
  certNumber: string
}) {
  return [
    normalizeRequiredString(params.gradingCompany, 'gradingCompany').toUpperCase(),
    normalizeRequiredString(params.certNumber, 'certNumber').toUpperCase(),
  ].join('|')
}

export function buildGradedContentIdentityKey(params: {
  locationId: Id<'inventoryLocations'>
  unitIdentityKey: string
}) {
  return ['graded', params.locationId, params.unitIdentityKey].join('|')
}

export function buildTcgplayerProductUrl(
  tcgplayerProductId: number | undefined,
): string | undefined {
  if (
    typeof tcgplayerProductId !== 'number' ||
    !Number.isFinite(tcgplayerProductId)
  ) {
    return undefined
  }

  return `https://www.tcgplayer.com/product/${tcgplayerProductId}`
}
