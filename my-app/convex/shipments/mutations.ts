import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

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
    } else {
      await ctx.db.insert("shipments", shipment);
    }
  },
});