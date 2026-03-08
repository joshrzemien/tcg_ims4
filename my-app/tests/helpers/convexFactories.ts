import type {
  Doc,
  Id,
  TableNames,
} from '../../convex/_generated/dataModel'

let nextId = 1

function createId<TTableName extends TableNames>(value: string): Id<TTableName> {
  return value as Id<TTableName>
}

function createDoc<TTableName extends TableNames>(
  value: Omit<Doc<TTableName>, '_id' | '_creationTime'> & {
    _id?: string
    _creationTime?: number
  },
): Doc<TTableName> {
  return {
    _id: createId<TTableName>(value._id ?? `${String(nextId++)}`),
    _creationTime: value._creationTime ?? 0,
    ...value,
  } as Doc<TTableName>
}

type DocOverrides<TTableName extends TableNames> = Partial<
  Omit<Doc<TTableName>, '_id' | '_creationTime'>
> & {
  _id?: string
  _creationTime?: number
}

export function buildCatalogProduct(
  overrides: DocOverrides<'catalogProducts'> = {},
): Doc<'catalogProducts'> {
  return createDoc<'catalogProducts'>({
    key: 'product-1',
    categoryKey: 'magic',
    setKey: 'lea',
    tcgtrackingCategoryId: 1,
    tcgtrackingSetId: 100,
    tcgplayerProductId: 1000,
    name: 'Black Lotus',
    cleanName: 'black lotus',
    lastIngestedAt: 1,
    updatedAt: 1,
    ...overrides,
  })
}

export function buildCatalogSku(
  overrides: DocOverrides<'catalogSkus'> = {},
): Doc<'catalogSkus'> {
  return createDoc<'catalogSkus'>({
    key: 'sku-1',
    catalogProductKey: 'product-1',
    categoryKey: 'magic',
    setKey: 'lea',
    tcgplayerSku: 1001,
    conditionCode: 'NM',
    languageCode: 'EN',
    variantCode: 'N',
    lastIngestedAt: 1,
    updatedAt: 1,
    ...overrides,
  })
}

export function buildPricingTrackedSeries(
  overrides: DocOverrides<'pricingTrackedSeries'> = {},
): Doc<'pricingTrackedSeries'> {
  return createDoc<'pricingTrackedSeries'>({
    key: 'product-1:normal',
    catalogProductKey: 'product-1',
    categoryKey: 'magic',
    setKey: 'lea',
    searchText: 'black lotus normal',
    name: 'Black Lotus',
    printingKey: 'normal',
    printingLabel: 'Normal',
    pricingSource: 'product_fallback',
    lastResolvedAt: 1,
    activeRuleCount: 0,
    active: false,
    updatedAt: 1,
    ...overrides,
  })
}

export function buildCatalogSet(
  overrides: DocOverrides<'catalogSets'> = {},
): Doc<'catalogSets'> {
  return createDoc<'catalogSets'>({
    key: 'lea',
    categoryKey: 'magic',
    tcgtrackingCategoryId: 1,
    categoryDisplayName: 'Magic',
    tcgtrackingSetId: 100,
    name: 'Limited Edition Alpha',
    productCount: 0,
    skuCount: 0,
    syncStatus: 'pending',
    syncedProductCount: 0,
    syncedSkuCount: 0,
    pricingSyncStatus: 'idle',
    inRuleScope: true,
    hasCompletedSync: false,
    hasSourceChanges: false,
    activeTrackedSeriesCount: 0,
    hasActiveTrackedSeries: false,
    updatedAt: 1,
    ...overrides,
  })
}

export function buildPricingTrackingRule(
  overrides: DocOverrides<'pricingTrackingRules'> = {},
): Doc<'pricingTrackingRules'> {
  return createDoc<'pricingTrackingRules'>({
    label: 'Magic rule',
    ruleType: 'category',
    active: true,
    categoryKey: 'magic',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  })
}

export function buildShipment(
  overrides: DocOverrides<'shipments'> = {},
): Doc<'shipments'> {
  return createDoc<'shipments'>({
    easypostShipmentId: 'shp_1',
    status: 'created',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  })
}
