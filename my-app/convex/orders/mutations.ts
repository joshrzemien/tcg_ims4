import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { normalizeShippingStatus } from "../utils/shippingStatus";

function platformShippingStatus(order: any): string {
  return normalizeShippingStatus(order.shippingStatus);
}

function easypostShippingStatus(shipment: any): string {
  return normalizeShippingStatus(shipment?.status);
}

async function latestShipmentForOrder(ctx: { db: any }, orderId: any) {
  const shipments = await ctx.db
    .query("shipments")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", orderId))
    .collect();

  if (shipments.length === 0) return null;

  return shipments.reduce((latest: any, shipment: any) => {
    const latestTimestamp = latest.updatedAt ?? latest.createdAt ?? 0;
    const shipmentTimestamp = shipment.updatedAt ?? shipment.createdAt ?? 0;
    return shipmentTimestamp > latestTimestamp ? shipment : latest;
  });
}

async function upsertSingleOrder(ctx: { db: any }, order: any) {
  const { status: _ignoredStatus, ...orderRecord } = order;

  const existing = await ctx.db
    .query("orders")
    .withIndex("by_externalId", (q: any) => q.eq("externalId", orderRecord.externalId))
    .unique();

  if (existing) {
    const latestShipment = await latestShipmentForOrder(ctx, existing._id);
    const shippingStatus = latestShipment
      ? easypostShippingStatus(latestShipment)
      : platformShippingStatus(orderRecord);
    const nextOrder = {
      ...orderRecord,
      shippingStatus,
    };

    // Sync jobs should not clear fulfillment if it was already set internally.
    if (typeof orderRecord.fulfillmentStatus !== "boolean") {
      delete nextOrder.fulfillmentStatus;
    }

    await ctx.db.patch(existing._id, nextOrder);
  } else {
    const nextOrder = {
      ...orderRecord,
      shippingStatus: platformShippingStatus(orderRecord),
      fulfillmentStatus:
        typeof orderRecord.fulfillmentStatus === "boolean" ? orderRecord.fulfillmentStatus : false,
    };
    await ctx.db.insert("orders", nextOrder);
  }
}

export const upsertOrder = internalMutation({
  args: { order: v.any() },
  handler: async (ctx, { order }) => {
    await upsertSingleOrder(ctx, order);
  },
});

export const upsertOrdersBatch = internalMutation({
  args: { orders: v.array(v.any()) },
  handler: async (ctx, { orders }) => {
    for (const order of orders) {
      await upsertSingleOrder(ctx, order);
    }
  },
});

export const setFulfillmentStatus = mutation({
  args: {
    orderId: v.id("orders"),
    fulfilled: v.boolean(),
  },
  handler: async (ctx, { orderId, fulfilled }) => {
    await ctx.db.patch(orderId, {
      fulfillmentStatus: fulfilled,
      updatedAt: Date.now(),
    });
  },
});
