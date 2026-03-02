// Refresh policy: CRON (tiered)
// Active/unfulfilled orders: every 15 min
// Last 2 weeks: every hour
// Last 3 months: every day

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { fetchManapoolOrders } from "./sources/manapool";

async function upsertAll(ctx: any, orders: any[]) {
  for (const order of orders) {
    await ctx.runMutation(internal.orders.mutations.upsertOrder, { order });
  }
}

export const syncActive = internalAction({
  handler: async (ctx) => {
    const orders = await fetchManapoolOrders({ unfulfilledOnly: true });
    await upsertAll(ctx, orders);
    return { synced: orders.length };
  },
});

export const syncRecent = internalAction({
  handler: async (ctx) => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orders = await fetchManapoolOrders({ since });
    await upsertAll(ctx, orders);
    return { synced: orders.length };
  },
});

export const syncArchive = internalAction({
  handler: async (ctx) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const orders = await fetchManapoolOrders({ since });
    await upsertAll(ctx, orders);
    return { synced: orders.length };
  },
});