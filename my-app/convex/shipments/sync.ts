// Refresh policy: ON_DEMAND
// Triggered by: manual action (one-time historical import)
// NOT on a cron

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { fetchManapoolOrders } from "../orders/sources/manapool";
import { fetchTcgplayerOrders } from "../orders/sources/tcgplayer";
import type { ActionCtx } from "../_generated/server";
import type { OrderRecord } from "../orders/types";

async function upsertOrdersInBatches(
  ctx: ActionCtx,
  orders: Array<OrderRecord>,
  chunkSize = 25
) {
  for (let i = 0; i < orders.length; i += chunkSize) {
    const batch = orders.slice(i, i + chunkSize);
    await ctx.runMutation(internal.orders.mutations.upsertOrdersBatch, { orders: batch });
  }
}

export const syncHistorical = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.EASYPOST_API_KEY!;

    // Fetch all shipments from EasyPost (paginated)
    // Fetch all shipments from EasyPost (paginated)
    let hasMore = true;
    let beforeId: string | undefined;
    const allShipments: Array<any> = [];

    // Go back far enough to get everything
    const startDate = new Date("2025-11-01T00:00:00Z");

    while (hasMore) {
    const params = new URLSearchParams({
        page_size: "100",
        start_datetime: startDate.toISOString(),
    });
    if (beforeId) params.set("before_id", beforeId);

    const res = await fetch(
        `https://api.easypost.com/v2/shipments?${params}`,
        {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        }
    );

    if (!res.ok) {
        throw new Error(`EasyPost list failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const shipments = data.shipments ?? [];
    allShipments.push(...shipments);

    console.log(`Page fetched: ${shipments.length} shipments, has_more: ${data.has_more}, total so far: ${allShipments.length}`);

    hasMore = data.has_more === true && shipments.length > 0;
    if (shipments.length > 0) {
        beforeId = shipments[shipments.length - 1].id;
    }
    }
    console.log(`Fetched ${allShipments.length} shipments from EasyPost`);

    // Backfill orders for the same historical window before matching shipments.
    const [manapoolOrders, tcgplayerOrders] = await Promise.all([
      fetchManapoolOrders({ since: startDate, batchDetails: true }),
      fetchTcgplayerOrders({ since: startDate, batchDetails: true }),
    ]);
    const backfilledOrders = [...manapoolOrders, ...tcgplayerOrders];
    console.log(`Backfetched ${backfilledOrders.length} orders for matching`);
    await upsertOrdersInBatches(ctx, backfilledOrders);

    // Get all orders to match against
    const orders = await ctx.runQuery(api.orders.queries.list);

    function normalizeText(value: unknown): string {
      return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeStreet(value: unknown): string {
      const withoutUnit = normalizeText(value)
        .replace(/\b(?:apartment|apt|unit|suite|ste|floor|fl)\b\s*\w*/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const tokenMap: Record<string, string> = {
        street: "st",
        avenue: "ave",
        road: "rd",
        boulevard: "blvd",
        drive: "dr",
        lane: "ln",
        court: "ct",
        place: "pl",
        circle: "cir",
        terrace: "ter",
        parkway: "pkwy",
        highway: "hwy",
        north: "n",
        south: "s",
        east: "e",
        west: "w",
      };

      return withoutUnit
        .split(" ")
        .filter(Boolean)
        .map((token) => tokenMap[token] ?? token)
        .join(" ");
    }

    function normalizePostalCode(value: unknown): string {
      const text = String(value ?? "");
      const usZip = text.match(/\d{5}/)?.[0];
      return usZip ?? normalizeText(text);
    }

    function normalizeAddress(addr: {
      street1?: string;
      line1?: string;
      city?: string;
      state?: string;
      zip?: string;
      postalCode?: string;
    }) {
      return {
        street: normalizeStreet(addr.street1 ?? addr.line1),
        city: normalizeText(addr.city),
        state: normalizeText(addr.state),
        zip: normalizePostalCode(addr.zip ?? addr.postalCode),
      };
    }

    function buildAddressKeys(addr: {
      street: string;
      city: string;
      state: string;
      zip: string;
    }): Array<string> {
      const keys: Array<string> = [];
      if (addr.street && addr.zip) keys.push(`${addr.street}|${addr.zip}`);
      if (addr.street && addr.city && addr.state) {
        keys.push(`${addr.street}|${addr.city}|${addr.state}`);
      }
      if (addr.street && addr.city) keys.push(`${addr.street}|${addr.city}`);
      if (addr.street) keys.push(addr.street);
      if (addr.zip && addr.city && addr.state) keys.push(`zip:${addr.zip}|${addr.city}|${addr.state}`);
      if (addr.zip) keys.push(`zip:${addr.zip}`);
      return keys;
    }

    const ordersByAddress = new Map<string, Array<any>>();
    for (const order of orders) {
      const normalized = normalizeAddress({
        line1: order.shippingAddress.line1,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.postalCode,
      });
      const keys = Array.from(new Set(buildAddressKeys(normalized)));
      for (const key of keys) {
        const existing = ordersByAddress.get(key) ?? [];
        existing.push(order);
        ordersByAddress.set(key, existing);
      }
    }

    let matched = 0;
    let unmatched = 0;
    const usedOrderIds = new Set<string>();

    function createdAtMs(value: unknown): number {
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }

    function snapshotEasyPostAddress(addr: any) {
      if (!addr || typeof addr !== "object") return undefined;
      return {
        id: addr.id,
        name: addr.name,
        company: addr.company,
        street1: addr.street1,
        street2: addr.street2,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country,
        phone: addr.phone,
        email: addr.email,
        residential: addr.residential,
      };
    }

    for (const ep of allShipments) {
      const toAddr = ep.to_address;
      const normalized = normalizeAddress({
        street1: toAddr?.street1,
        city: toAddr?.city,
        state: toAddr?.state,
        zip: toAddr?.zip,
      });
      const keys = buildAddressKeys(normalized);
      let candidates: Array<any> | undefined;
      for (const key of keys) {
        const next = ordersByAddress.get(key);
        if (next && next.length > 0) {
          candidates = next;
          break;
        }
      }
      let order = null;
      if (candidates && candidates.length > 0) {
        const shipmentTime = ep.created_at ? new Date(ep.created_at).getTime() : Date.now();
        const ranked = [...candidates].sort((a, b) => {
          const aDiff = Math.abs(createdAtMs(a.createdAt) - shipmentTime);
          const bDiff = Math.abs(createdAtMs(b.createdAt) - shipmentTime);
          return aDiff - bDiff;
        });
        order =
          ranked.find((candidate) => !usedOrderIds.has(String(candidate._id))) ??
          ranked[0] ??
          null;
      }

      const purchased = !!(ep.tracking_code && ep.postage_label?.label_url);

      const shipment: any = {
        orderId: order?._id ?? undefined,
        status: purchased ? "purchased" : "created",
        easypostShipmentId: ep.id,
        addressVerified: true,
        toAddress: snapshotEasyPostAddress(toAddr),
        toAddressId: toAddr?.id,
        fromAddressId: ep.from_address?.id,
        rates: (ep.rates ?? []).map((r: any) => ({
          rateId: r.id,
          carrier: r.carrier,
          service: r.service,
          rateCents: Math.round(parseFloat(r.rate) * 100),
          ...(r.delivery_days != null && { deliveryDays: r.delivery_days }),
        })),
        ...(ep.tracking_code && { trackingNumber: ep.tracking_code }),
        ...(ep.postage_label?.label_url && { labelUrl: ep.postage_label.label_url }),
        ...(ep.selected_rate?.rate && {
          rateCents: Math.round(parseFloat(ep.selected_rate.rate) * 100),
        }),
        ...(ep.selected_rate?.carrier && { carrier: ep.selected_rate.carrier }),
        ...(ep.selected_rate?.service && { service: ep.selected_rate.service }),
        ...(ep.tracker?.id && { easypostTrackerId: ep.tracker.id }),
        createdAt: ep.created_at ? new Date(ep.created_at).getTime() : Date.now(),
        updatedAt: Date.now(),
      };

      if (order) {
        matched++;
        usedOrderIds.add(String(order._id));
      } else {
        unmatched++;
        console.warn(`No order match for shipment ${ep.id} to keys ${keys.join(", ")}`);
      }

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, { shipment });
    }

    return { total: allShipments.length, matched, unmatched };
  },
});
