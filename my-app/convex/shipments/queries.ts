import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("shipments").collect();
  },
});

export const getByOrderId = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    return await ctx.db
      .query("shipments")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .collect();
  },
});