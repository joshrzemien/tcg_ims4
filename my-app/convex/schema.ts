import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  orders: defineTable({
    externalId: v.string(), // Manapool UUID
    orderNumber: v.string(), // Manapool UUID (same for now, label is for shipping)
    channel: v.string(), // "manapool", "tcgplayer", "seeded"
    customerName: v.string(),
    status: v.string(), // pending, processing, shipped, delivered, refunded, replaced
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
  }).index("by_status", ["status"])
    .index("by_externalId", ["externalId"]),
});
