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

const shipmentSummaryValidator = v.object({
  _id: v.id('shipments'),
  easypostShipmentId: v.string(),
  status: shippingStatusValidator,
  trackingNumber: v.optional(v.string()),
  labelUrl: v.optional(v.string()),
  refundStatus: v.optional(v.string()),
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
    apiUrl: v.string(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_tcgtrackingCategoryId', ['tcgtrackingCategoryId']),
  catalogSets: defineTable({
    key: v.string(),
    categoryKey: v.string(),
    tcgtrackingCategoryId: v.number(),
    categoryName: v.string(),
    categoryDisplayName: v.string(),
    tcgtrackingSetId: v.number(),
    name: v.string(),
    abbreviation: v.optional(v.string()),
    isSupplemental: v.optional(v.boolean()),
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
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_categoryKey', ['categoryKey']),
  catalogProducts: defineTable({
    key: v.string(),
    categoryKey: v.string(),
    setKey: v.string(),
    tcgtrackingCategoryId: v.number(),
    tcgtrackingSetId: v.number(),
    tcgplayerProductId: v.number(),
    name: v.string(),
    cleanName: v.string(),
    number: v.optional(v.string()),
    rarity: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageCount: v.optional(v.number()),
    tcgplayerUrl: v.optional(v.string()),
    manapoolUrl: v.optional(v.string()),
    scryfallId: v.optional(v.string()),
    mtgjsonUuid: v.optional(v.string()),
    cardmarketId: v.optional(v.number()),
    cardtraderId: v.optional(v.number()),
    cardtrader: v.optional(v.any()),
    colors: v.optional(v.array(v.string())),
    colorIdentity: v.optional(v.array(v.string())),
    manaValue: v.optional(v.number()),
    finishes: v.optional(v.array(v.string())),
    borderColor: v.optional(v.string()),
    tcgplayerPricing: v.optional(v.any()),
    manapoolPricing: v.optional(v.any()),
    manapoolQuantity: v.optional(v.number()),
    sourceDataModifiedAt: v.optional(v.number()),
    pricingUpdatedAt: v.optional(v.number()),
    skuPricingUpdatedAt: v.optional(v.number()),
    lastIngestedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_tcgplayerProductId', ['tcgplayerProductId'])
    .index('by_setKey', ['setKey'])
    .index('by_setKey_lastIngestedAt', ['setKey', 'lastIngestedAt']),
  catalogSkus: defineTable({
    key: v.string(),
    catalogProductKey: v.string(),
    categoryKey: v.string(),
    setKey: v.string(),
    tcgtrackingCategoryId: v.number(),
    tcgtrackingSetId: v.number(),
    tcgplayerProductId: v.number(),
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
    .index('by_catalogProductKey', ['catalogProductKey'])
    .index('by_setKey', ['setKey'])
    .index('by_setKey_lastIngestedAt', ['setKey', 'lastIngestedAt']),
  shipments: defineTable({
    orderId: v.optional(v.id('orders')),
    status: shippingStatusValidator, // Canonical EasyPost-derived order shipping status
    easypostShipmentId: v.string(),
    trackingStatus: v.optional(shippingStatusValidator), // Canonical EasyPost tracker status
    // Address verification
    toAddress: v.optional(v.any()), // EasyPost to_address snapshot
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
    shippingMethod: v.optional(v.string()), // Canonical internal shipping method: Letter | Parcel
    easypostTrackerId: v.optional(v.string()),
    trackerPublicUrl: v.optional(v.string()),
    // Refund
    refundStatus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_orderId', ['orderId'])
    .index('by_easypostShipmentId', ['easypostShipmentId'])
    .index('by_status_createdAt', ['status', 'createdAt']),
  orders: defineTable({
    externalId: v.string(), // Manapool UUID
    orderNumber: v.string(), // Manapool UUID (same for now, label is for shipping)
    channel: v.string(), // "manapool", "tcgplayer", "seeded"
    customerName: v.string(),
    shippingStatus: v.optional(shippingStatusValidator), // Canonical shipping lifecycle/platform status
    fulfillmentStatus: v.optional(v.boolean()), // internal flag set by our workflow
    shippingMethod: v.string(), // Canonical internal shipping method: Letter | Parcel
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
        mtgjsonId: v.string(),
        priceCents: v.number(),
        productType: v.string(), // mtg_single, mtg_sealed
        set: v.string(), // set code
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
    shipmentCount: v.optional(v.number()),
    reviewShipmentCount: v.optional(v.number()),
    activeShipment: v.optional(shipmentSummaryValidator),
    latestShipment: v.optional(shipmentSummaryValidator),
  })
    .index('by_externalId', ['externalId'])
    .index('by_createdAt', ['createdAt']),
})
