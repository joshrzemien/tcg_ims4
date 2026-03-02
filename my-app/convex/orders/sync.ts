// Refresh policy: CRON (tiered)
// Active/unfulfilled orders: every 15 min
// Last 2 weeks: every hour
// Last 3 months: every day

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { fetchManapoolOrders } from "./sources/manapool";
import { fetchTcgplayerOrders } from "./sources/tcgplayer";

async function upsertAll(ctx: any, orders: any[]) {
  for (const order of orders) {
    await ctx.runMutation(internal.orders.mutations.upsertOrder, { order });
  }
}

export const syncActive = internalAction({
  handler: async (ctx) => {
    const orders = await fetchManapoolOrders({ unfulfilledOnly: true });
    const tcgplayerOrders = await fetchTcgplayerOrders({ unfulfilledOnly: true });
    const allOrders = [...orders, ...tcgplayerOrders];
    await upsertAll(ctx, allOrders);
    return { synced: allOrders.length };
  },
});

export const syncRecent = internalAction({
  handler: async (ctx) => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orders = await fetchManapoolOrders({ since });
    const tcgplayerOrders = await fetchTcgplayerOrders({ since });
    const allOrders = [...orders, ...tcgplayerOrders];
    await upsertAll(ctx, allOrders);
    return { synced: allOrders.length };
  },
});

export const syncArchive = internalAction({
  handler: async (ctx) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const orders = await fetchManapoolOrders({ since });
    const tcgplayerOrders = await fetchTcgplayerOrders({ since });
    const allOrders = [...orders, ...tcgplayerOrders];
    await upsertAll(ctx, allOrders);
    return { synced: allOrders.length };
  },
});