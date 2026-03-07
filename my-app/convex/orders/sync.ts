// Refresh policy: CRON (tiered)
// Active/unfulfilled orders: every 15 min
// Last 2 weeks: every hour
// Last 3 months: every day

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { fetchManapoolOrders } from "./sources/manapool";
import { fetchTcgplayerOrders } from "./sources/tcgplayer";
import type { ActionCtx } from "../_generated/server";
import type { OrderRecord } from "./types";

const CATALOG_LINK_BACKFILL_BATCH_SIZE = 50;

async function upsertAll(ctx: ActionCtx, orders: Array<OrderRecord>) {
  for (const order of orders) {
    await ctx.runMutation(internal.orders.mutations.upsertOrder, { order });
  }
}

async function upsertAllDailyBatch(
  ctx: ActionCtx,
  orders: Array<OrderRecord>,
  chunkSize = 25
) {
  for (let i = 0; i < orders.length; i += chunkSize) {
    const batch = orders.slice(i, i + chunkSize);
    await ctx.runMutation(internal.orders.mutations.upsertOrdersBatch, { orders: batch });
  }
}

export const syncActive = internalAction({
  args: {},
  handler: async (ctx) => {
    const orders = await fetchManapoolOrders({ unfulfilledOnly: true });
    const tcgplayerOrders = await fetchTcgplayerOrders({ unfulfilledOnly: true });
    const allOrders = [...orders, ...tcgplayerOrders];
    await upsertAll(ctx, allOrders);
    return { synced: allOrders.length };
  },
});

export const syncRecent = internalAction({
  args: {},
  handler: async (ctx) => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // Last 2 weeks
    const orders = await fetchManapoolOrders({ since });
    const tcgplayerOrders = await fetchTcgplayerOrders({ since });
    const allOrders = [...orders, ...tcgplayerOrders];
    await upsertAll(ctx, allOrders);
    return { synced: allOrders.length };
  },
});

export const syncArchive = internalAction({
  args: {},
  handler: async (ctx) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Last 3 months
    const orders = await fetchManapoolOrders({ since, batchDetails: true });
    const tcgplayerOrders = await fetchTcgplayerOrders({ since, batchDetails: true });
    const allOrders = [...orders, ...tcgplayerOrders];
    await upsertAllDailyBatch(ctx, allOrders);
    return { synced: allOrders.length };
  },
});

export const backfillCatalogLinks = internalAction({
  args: {},
  handler: async (ctx) => {
    // Catalog links should normally be assigned during order ingest. This backfill is
    // for repair/manual recovery, not something catalog syncs should trigger.
    let cursor: string | null = null;
    let scanned = 0;
    let updated = 0;
    let pages = 0;
    let isDone = false;

    while (!isDone) {
      // TODO: Keep this job coarse-grained and decoupled from per-set catalog syncs.
      // Re-walking the entire orders table after each catalog set completion is high
      // cost for low backfill value.
      const result: {
        continueCursor: string;
        isDone: boolean;
        scanned: number;
        updated: number;
      } = await ctx.runMutation(internal.orders.mutations.backfillCatalogLinks, {
        cursor,
        limit: CATALOG_LINK_BACKFILL_BATCH_SIZE,
      });

      scanned += result.scanned;
      updated += result.updated;
      pages += 1;
      isDone = result.isDone;
      cursor = result.isDone ? null : result.continueCursor;
    }

    return {
      pages,
      scanned,
      updated,
    };
  },
});
