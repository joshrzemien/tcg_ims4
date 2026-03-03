import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  shipments: defineTable({
    orderId: v.optional(v.id("orders")),
    status: v.string(), // "created", "purchased", "refunded"
    easypostShipmentId: v.string(),
    // Address verification
    toAddress: v.optional(v.any()), // EasyPost to_address snapshot
    toAddressId: v.optional(v.string()),
    fromAddressId: v.optional(v.string()),
    addressVerified: v.optional(v.boolean()),
    // Rates (stored after createShipment)
    rates: v.optional(v.array(v.object({
      rateId: v.string(),
      carrier: v.string(),
      service: v.string(),
      rateCents: v.number(),
      deliveryDays: v.optional(v.number()),
    }))),
    // Purchase data (populated after buyShipment)
    trackingNumber: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    rateCents: v.optional(v.number()),
    carrier: v.optional(v.string()),
    service: v.optional(v.string()),
    easypostTrackerId: v.optional(v.string()),
    // Refund
    refundStatus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_orderId", ["orderId"])
    .index("by_easypostShipmentId", ["easypostShipmentId"]),
  orders: defineTable({
    externalId: v.string(), // Manapool UUID
    orderNumber: v.string(), // Manapool UUID (same for now, label is for shipping)
    channel: v.string(), // "manapool", "tcgplayer", "seeded"
    customerName: v.string(),
    shippingStatus: v.optional(v.string()), // EasyPost when available, otherwise platform status
    fulfillmentStatus: v.optional(v.boolean()), // internal flag set by our workflow
    shippingMethod: v.string(), // first_class, ground_advantage
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
    items: v.array(v.object({
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
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_externalId", ["externalId"]),
});
