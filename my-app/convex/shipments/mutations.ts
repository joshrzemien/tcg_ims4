import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { normalizeShippingStatus } from "../utils/shippingStatus";

async function syncOrderShippingStatus(
  ctx: { db: any },
  orderId: any,
  shipmentStatus: unknown
) {
  if (!orderId) return;
  await ctx.db.patch(orderId, {
    shippingStatus: normalizeShippingStatus(shipmentStatus),
    updatedAt: Date.now(),
  });
}

export const upsertShipment = internalMutation({
  args: { shipment: v.any() },
  handler: async (ctx, { shipment }) => {
    const existing = await ctx.db
      .query("shipments")
      .withIndex("by_easypostShipmentId", (q) =>
        q.eq("easypostShipmentId", shipment.easypostShipmentId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, shipment);
      await syncOrderShippingStatus(
        ctx,
        shipment.orderId ?? existing.orderId,
        shipment.status ?? existing.status
      );
    } else {
      await ctx.db.insert("shipments", shipment);
      await syncOrderShippingStatus(ctx, shipment.orderId, shipment.status);
    }
  },
});
