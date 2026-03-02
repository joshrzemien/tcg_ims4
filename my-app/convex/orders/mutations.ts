import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const upsertOrder = internalMutation({
  args: { order: v.any() },
  handler: async (ctx, { order }) => {
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_externalId", (q) => q.eq("externalId", order.externalId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, order);
    } else {
      await ctx.db.insert("orders", order);
    }
  },
});