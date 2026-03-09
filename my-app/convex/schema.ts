import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const shippingStatusValidator = v.union(
  v.literal('pending'),
  v.literal('processing'),
  v.literal('created'),
  v.literal('purchased'),
  v.literal('pre_transit'),
  v.literal('in_transit'),
  v.literal('out_for_delivery'),
  v.literal('shipped'),
  v.literal('delivered'),
  v.literal('available_for_pickup'),
  v.literal('return_to_sender'),
  v.literal('failure'),
  v.literal('error'),
  v.literal('cancelled'),
  v.literal('refunded'),
  v.literal('replaced'),
  v.literal('unknown'),
)

const catalogSyncStatusValidator = v.union(
  v.literal('pending'),
  v.literal('syncing'),
  v.literal('ready'),
  v.literal('error'),
)

const pricingSyncStatusValidator = v.union(
  v.literal('idle'),
  v.literal('syncing'),
  v.literal('error'),
)

const orderChannelValidator = v.union(
  v.literal('manapool'),
  v.literal('tcgplayer'),
  v.literal('seeded'),
)

const shippingMethodValidator = v.union(
  v.literal('Letter'),
  v.literal('Parcel'),
)

const shipmentRefundStatusValidator = v.union(
  v.literal('submitted'),
  v.literal('refunded'),
  v.literal('rejected'),
  v.literal('not_applicable'),
  v.literal('unknown'),
)

const orderItemProductTypeValidator = v.union(
  v.literal('mtg_single'),
  v.literal('mtg_sealed'),
)

const inventoryTypeValidator = v.union(
  v.literal('single'),
  v.literal('sealed'),
)

const inventoryMetadataFieldValidator = v.object({
  key: v.string(),
  value: v.string(),
})

const setSyncModeValidator = v.union(
  v.literal('full'),
  v.literal('pricing_only'),
)

const pricingTrackingRuleTypeValidator = v.union(
  v.literal('manual_product'),
  v.literal('set'),
  v.literal('category'),
)

const pricingSourceValidator = v.union(
  v.literal('sku'),
  v.literal('product_fallback'),
  v.literal('unavailable'),
)

const pricingResolutionIssueTypeValidator = v.union(
  v.literal('ambiguous_nm_en_sku'),
  v.literal('unmapped_printing'),
  v.literal('missing_product_price'),
  v.literal('missing_manapool_match'),
  v.literal('sync_error'),
)

const easypostAddressSnapshotValidator = v.object({
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  company: v.optional(v.string()),
  street1: v.optional(v.string()),
  street2: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  country: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  residential: v.optional(v.union(v.boolean(), v.string())),
})

const shipmentSummaryValidator = v.object({
  _id: v.id('shipments'),
  easypostShipmentId: v.string(),
  status: shippingStatusValidator,
  trackingNumber: v.optional(v.string()),
  labelUrl: v.optional(v.string()),
  refundStatus: v.optional(shipmentRefundStatusValidator),
  trackingStatus: v.optional(shippingStatusValidator),
  carrier: v.optional(v.string()),
  service: v.optional(v.string()),
  rateCents: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  trackerPublicUrl: v.optional(v.string()),
})

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  catalogCategories: defineTable({
    key: v.string(),
    tcgtrackingCategoryId: v.number(),
    name: v.string(),
    displayName: v.string(),
    productCount: v.number(),
    setCount: v.number(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_displayName', ['displayName'])
    .searchIndex('search_displayName', {
      searchField: 'displayName',
    }),
  catalogSets: defineTable({
    key: v.string(),
    categoryKey: v.string(),
    tcgtrackingCategoryId: v.number(),
    categoryDisplayName: v.string(),
    tcgtrackingSetId: v.number(),
    name: v.string(),
    abbreviation: v.optional(v.string()),
    publishedOn: v.optional(v.string()),
    modifiedOn: v.optional(v.string()),
    productCount: v.number(),
    skuCount: v.number(),
    productsModifiedAt: v.optional(v.string()),
    pricingModifiedAt: v.optional(v.string()),
    skusModifiedAt: v.optional(v.string()),
    syncStatus: catalogSyncStatusValidator,
    currentSyncStartedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    nextSyncAttemptAt: v.optional(v.number()),
    consecutiveSyncFailures: v.optional(v.number()),
    syncedProductCount: v.number(),
    syncedSkuCount: v.number(),
    pricingSyncStatus: pricingSyncStatusValidator,
    currentPricingSyncStartedAt: v.optional(v.number()),
    lastPricingSyncError: v.optional(v.string()),
    pendingSyncMode: v.optional(setSyncModeValidator),
    inRuleScope: v.boolean(),
    hasCompletedSync: v.boolean(),
    latestSourceUpdatedAt: v.optional(v.number()),
    hasSourceChanges: v.boolean(),
    activeTrackedSeriesCount: v.number(),
    hasActiveTrackedSeries: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_categoryKey', ['categoryKey'])
    .index('by_name', ['name'])
    .index('by_categoryKey_name', ['categoryKey', 'name'])
    .index('by_inRuleScope_isSynced_lastSyncedAt', [
      'inRuleScope',
      'hasCompletedSync',
      'lastSyncedAt',
    ])
    .index('by_inRuleScope_hasSourceChanges_latestSourceUpdatedAt', [
      'inRuleScope',
      'hasSourceChanges',
      'latestSourceUpdatedAt',
    ])
    .index('by_inRuleScope_syncStatus_nextSyncAttemptAt', [
      'inRuleScope',
      'syncStatus',
      'nextSyncAttemptAt',
    ])
    .index('by_hasActiveTrackedSeries_lastSyncedAt', [
      'hasActiveTrackedSeries',
      'lastSyncedAt',
    ])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['categoryKey'],
    }),
  catalogProducts: defineTable({
    key: v.string(),
    categoryKey: v.string(),
    setKey: v.string(),
    tcgtrackingCategoryId: v.number(),
    tcgtrackingSetId: v.number(),
    tcgplayerProductId: v.number(),
    tcgplayerUrl: v.optional(v.string()),
    name: v.string(),
    cleanName: v.string(),
    number: v.optional(v.string()),
    rarity: v.optional(v.string()),
    finishes: v.optional(v.array(v.string())),
    tcgplayerPricing: v.optional(v.any()),
    manapoolPricing: v.optional(v.any()),
    manapoolQuantity: v.optional(v.number()),
    pricingUpdatedAt: v.optional(v.number()),
    skuPricingUpdatedAt: v.optional(v.number()),
    lastIngestedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_cleanName', ['cleanName'])
    .index('by_tcgplayerProductId', ['tcgplayerProductId'])
    .index('by_setKey', ['setKey'])
    .index('by_setKey_lastIngestedAt', ['setKey', 'lastIngestedAt'])
    .searchIndex('search_cleanName', {
      searchField: 'cleanName',
      filterFields: ['categoryKey', 'setKey'],
    }),
  catalogSkus: defineTable({
    key: v.string(),
    catalogProductKey: v.string(),
    categoryKey: v.string(),
    setKey: v.string(),
    tcgplayerSku: v.number(),
    conditionCode: v.optional(v.string()),
    variantCode: v.optional(v.string()),
    languageCode: v.optional(v.string()),
    marketPriceCents: v.optional(v.number()),
    lowPriceCents: v.optional(v.number()),
    highPriceCents: v.optional(v.number()),
    listingCount: v.optional(v.number()),
    pricingUpdatedAt: v.optional(v.number()),
    lastIngestedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_tcgplayerSku', ['tcgplayerSku'])
    .index('by_setKey', ['setKey'])
    .index('by_setKey_lastIngestedAt', ['setKey', 'lastIngestedAt']),
  pricingTrackingRules: defineTable({
    ruleType: pricingTrackingRuleTypeValidator,
    label: v.string(),
    active: v.boolean(),
    categoryKey: v.optional(v.string()),
    setKey: v.optional(v.string()),
    catalogProductKey: v.optional(v.string()),
    scopeLabel: v.optional(v.string()),
    categoryGroupKey: v.optional(v.string()),
    categoryGroupLabel: v.optional(v.string()),
    setGroupKey: v.optional(v.string()),
    setGroupLabel: v.optional(v.string()),
    seedExistingSets: v.optional(v.boolean()),
    autoTrackFutureSets: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_active', ['active'])
    .index('by_ruleType_active', ['ruleType', 'active'])
    .index('by_categoryKey', ['categoryKey'])
    .index('by_active_categoryKey', ['active', 'categoryKey'])
    .index('by_setKey', ['setKey'])
    .index('by_active_setKey', ['active', 'setKey'])
    .index('by_catalogProductKey', ['catalogProductKey']),
  pricingTrackedSeries: defineTable({
    key: v.string(),
    catalogProductKey: v.string(),
    categoryKey: v.string(),
    setKey: v.string(),
    searchText: v.string(),
    name: v.string(),
    number: v.optional(v.string()),
    rarity: v.optional(v.string()),
    printingKey: v.string(),
    printingLabel: v.string(),
    skuVariantCode: v.optional(v.string()),
    pricingSource: pricingSourceValidator,
    preferredCatalogSkuKey: v.optional(v.string()),
    preferredTcgplayerSku: v.optional(v.number()),
    currentTcgMarketPriceCents: v.optional(v.number()),
    currentTcgLowPriceCents: v.optional(v.number()),
    currentTcgHighPriceCents: v.optional(v.number()),
    currentListingCount: v.optional(v.number()),
    currentManapoolPriceCents: v.optional(v.number()),
    currentManapoolQuantity: v.optional(v.number()),
    lastSnapshotFingerprint: v.optional(v.string()),
    lastSnapshotAt: v.optional(v.number()),
    lastResolvedAt: v.number(),
    activeRuleCount: v.number(),
    active: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_updatedAt', ['updatedAt'])
    .index('by_active', ['active'])
    .index('by_catalogProductKey', ['catalogProductKey'])
    .index('by_active_updatedAt', ['active', 'updatedAt'])
    .index('by_pricingSource_updatedAt', ['pricingSource', 'updatedAt'])
    .index('by_active_pricingSource_updatedAt', [
      'active',
      'pricingSource',
      'updatedAt',
    ])
    .index('by_printingKey_updatedAt', ['printingKey', 'updatedAt'])
    .index('by_active_printingKey_updatedAt', [
      'active',
      'printingKey',
      'updatedAt',
    ])
    .index('by_setKey', ['setKey'])
    .index('by_setKey_updatedAt', ['setKey', 'updatedAt'])
    .index('by_categoryKey', ['categoryKey'])
    .index('by_categoryKey_updatedAt', ['categoryKey', 'updatedAt'])
    .index('by_active_setKey', ['active', 'setKey'])
    .index('by_active_setKey_updatedAt', ['active', 'setKey', 'updatedAt'])
    .index('by_active_categoryKey_updatedAt', ['active', 'categoryKey', 'updatedAt'])
    .searchIndex('search_searchText', {
      searchField: 'searchText',
      filterFields: ['active', 'categoryKey', 'setKey', 'pricingSource', 'printingKey'],
    }),
  pricingTrackedSeriesRules: defineTable({
    key: v.string(),
    ruleId: v.id('pricingTrackingRules'),
    seriesKey: v.string(),
    setKey: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ruleId', ['ruleId'])
    .index('by_ruleId_active', ['ruleId', 'active'])
    .index('by_setKey', ['setKey']),
  pricingHistory: defineTable({
    seriesKey: v.string(),
    capturedAt: v.number(),
    effectiveAt: v.number(),
    pricingSource: v.union(v.literal('sku'), v.literal('product_fallback')),
    tcgMarketPriceCents: v.optional(v.number()),
    tcgLowPriceCents: v.optional(v.number()),
    tcgHighPriceCents: v.optional(v.number()),
    listingCount: v.optional(v.number()),
    manapoolPriceCents: v.optional(v.number()),
    manapoolQuantity: v.optional(v.number()),
  })
    .index('by_seriesKey_effectiveAt', ['seriesKey', 'effectiveAt']),
  pricingResolutionIssues: defineTable({
    key: v.string(),
    catalogProductKey: v.string(),
    seriesKey: v.string(),
    setKey: v.string(),
    categoryKey: v.string(),
    issueType: pricingResolutionIssueTypeValidator,
    details: v.any(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    occurrenceCount: v.number(),
    active: v.boolean(),
    isIgnored: v.boolean(),
    ignoredAt: v.optional(v.number()),
  })
    .index('by_key', ['key'])
    .index('by_lastSeenAt', ['lastSeenAt'])
    .index('by_issueType_lastSeenAt', ['issueType', 'lastSeenAt'])
    .index('by_isIgnored_lastSeenAt', ['isIgnored', 'lastSeenAt'])
    .index('by_isIgnored_issueType_lastSeenAt', [
      'isIgnored',
      'issueType',
      'lastSeenAt',
    ])
    .index('by_active', ['active'])
    .index('by_active_lastSeenAt', ['active', 'lastSeenAt'])
    .index('by_active_issueType_lastSeenAt', ['active', 'issueType', 'lastSeenAt'])
    .index('by_active_isIgnored_lastSeenAt', ['active', 'isIgnored', 'lastSeenAt'])
    .index('by_active_isIgnored_issueType_lastSeenAt', [
      'active',
      'isIgnored',
      'issueType',
      'lastSeenAt',
    ])
    .index('by_active_setKey', ['active', 'setKey'])
    .index('by_active_setKey_lastSeenAt', ['active', 'setKey', 'lastSeenAt'])
    .index('by_setKey', ['setKey'])
    .index('by_setKey_lastSeenAt', ['setKey', 'lastSeenAt'])
    .index('by_categoryKey_lastSeenAt', ['categoryKey', 'lastSeenAt'])
    .index('by_active_categoryKey_lastSeenAt', ['active', 'categoryKey', 'lastSeenAt']),
  pricingDashboardStats: defineTable({
    key: v.string(),
    totalTrackedSeries: v.number(),
    totalActiveTrackedSeries: v.number(),
    totalRules: v.number(),
    totalActiveRules: v.number(),
    totalIssues: v.number(),
    totalActiveIssues: v.number(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
  pricingRuleDashboardStats: defineTable({
    key: v.string(),
    ruleId: v.id('pricingTrackingRules'),
    activeSeriesCount: v.number(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
  inventoryItems: defineTable({
    inventoryType: inventoryTypeValidator,
    catalogProductKey: v.string(),
    catalogSkuKey: v.optional(v.string()),
    quantity: v.number(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    metadataFields: v.optional(v.array(inventoryMetadataFieldValidator)),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_inventoryType_updatedAt', ['inventoryType', 'updatedAt'])
    .index('by_catalogProductKey', ['catalogProductKey'])
    .index('by_catalogSkuKey', ['catalogSkuKey']),
  shipments: defineTable({
    orderId: v.optional(v.id('orders')),
    status: shippingStatusValidator, // Canonical EasyPost-derived order shipping status
    easypostShipmentId: v.string(),
    trackingStatus: v.optional(shippingStatusValidator), // Canonical EasyPost tracker status
    // Address verification
    toAddress: v.optional(easypostAddressSnapshotValidator), // EasyPost to_address snapshot
    toAddressId: v.optional(v.string()),
    fromAddressId: v.optional(v.string()),
    addressVerified: v.optional(v.boolean()),
    // Rates (stored after createShipment)
    rates: v.optional(
      v.array(
        v.object({
          rateId: v.string(),
          carrier: v.string(),
          service: v.string(),
          rateCents: v.number(),
          deliveryDays: v.optional(v.number()),
        }),
      ),
    ),
    // Purchase data (populated after buyShipment)
    trackingNumber: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    rateCents: v.optional(v.number()),
    carrier: v.optional(v.string()),
    service: v.optional(v.string()),
    shippingMethod: v.optional(shippingMethodValidator), // Canonical internal shipping method: Letter | Parcel
    easypostTrackerId: v.optional(v.string()),
    trackerPublicUrl: v.optional(v.string()),
    // Refund
    refundStatus: v.optional(shipmentRefundStatusValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_orderId', ['orderId'])
    .index('by_easypostShipmentId', ['easypostShipmentId'])
    .index('by_status_createdAt', ['status', 'createdAt'])
    .index('by_orderId_status_createdAt', ['orderId', 'status', 'createdAt']),
  orders: defineTable({
    externalId: v.string(), // Manapool UUID
    orderNumber: v.string(), // Manapool UUID (same for now, label is for shipping)
    channel: orderChannelValidator, // "manapool", "tcgplayer", "seeded"
    customerName: v.string(),
    shippingStatus: shippingStatusValidator, // Canonical shipping lifecycle/platform status
    isFulfilled: v.boolean(), // internal flag set by our workflow
    shippingMethod: shippingMethodValidator, // Canonical internal shipping method: Letter | Parcel
    shippingAddress: v.object({
      name: v.string(),
      line1: v.string(),
      line2: v.optional(v.string()),
      line3: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      postalCode: v.string(),
      country: v.string(),
    }),
    totalAmountCents: v.number(),
    shippingCostCents: v.number(),
    feeCents: v.number(),
    refundAmountCents: v.number(),
    itemCount: v.number(),
    items: v.array(
      v.object({
        name: v.string(),
        quantity: v.number(),
        productId: v.string(),
        mtgjsonId: v.optional(v.string()),
        priceCents: v.number(),
        productType: orderItemProductTypeValidator, // mtg_single, mtg_sealed
        set: v.optional(v.string()), // set code
        conditionId: v.optional(v.string()), // NM, LP, MP, HP, DMG (singles only)
        finishId: v.optional(v.string()), // NF, FO, EF (singles only)
        languageId: v.string(),
        collectorNumber: v.optional(v.string()), // singles only
        scryfallId: v.optional(v.string()), // singles only
        tcgplayerSku: v.optional(v.number()),
        catalogProductKey: v.optional(v.string()),
        catalogSkuKey: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    trackingPublicUrl: v.optional(v.string()),
    shipmentCount: v.number(),
    reviewShipmentCount: v.number(),
    activeShipment: v.optional(shipmentSummaryValidator),
    latestShipment: v.optional(shipmentSummaryValidator),
  })
    .index('by_externalId', ['externalId'])
    .index('by_createdAt', ['createdAt'])
    .index('by_isFulfilled_createdAt', [
      'isFulfilled',
      'createdAt',
    ]),
})
