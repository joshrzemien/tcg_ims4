// Refresh policy: ON_DEMAND
// Triggered by: manual action (one-time historical import)
// NOT on a cron

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";

export const syncHistorical = internalAction({
  handler: async (ctx) => {
    const apiKey = process.env.EASYPOST_API_KEY!;

    // Fetch all shipments from EasyPost (paginated)
    // Fetch all shipments from EasyPost (paginated)
    let hasMore = true;
    let beforeId: string | undefined;
    const allShipments: any[] = [];

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

    // Get all orders to match against
    const orders = await ctx.runQuery(api.orders.queries.list);

    // Build lookup by normalized address, grouped for multiple orders at same address
    function normalizeAddress(addr: any): string {
      if (!addr) return "";
      const street = (addr.street1 ?? addr.line1 ?? "").toLowerCase().trim();
      const zip = (addr.zip ?? addr.postalCode ?? "").split("-")[0].trim();
      return `${street}|${zip}`;
    }

    const ordersByAddress = new Map<string, any[]>();
    for (const order of orders) {
      const key = normalizeAddress({
        street1: order.shippingAddress?.line1,
        zip: order.shippingAddress?.postalCode,
      });
      if (key && key !== "|") {
        const existing = ordersByAddress.get(key) ?? [];
        existing.push(order);
        ordersByAddress.set(key, existing);
      }
    }

    let matched = 0;
    let unmatched = 0;

    for (const ep of allShipments) {
      const toAddr = ep.to_address;
      const key = normalizeAddress({
        street1: toAddr?.street1,
        city: toAddr?.city,
        state: toAddr?.state,
        zip: toAddr?.zip,
      });

      // Match: single match = easy, multiple = closest by date
      const candidates = ordersByAddress.get(key);
      let order = null;
      if (candidates && candidates.length === 1) {
        order = candidates[0];
      } else if (candidates && candidates.length > 1) {
        const shipmentTime = ep.created_at ? new Date(ep.created_at).getTime() : Date.now();
        order = candidates.reduce((closest: any, candidate: any) => {
          const closestDiff = Math.abs(closest.createdAt - shipmentTime);
          const candidateDiff = Math.abs(candidate.createdAt - shipmentTime);
          return candidateDiff < closestDiff ? candidate : closest;
        });
      }

      const purchased = !!(ep.tracking_code && ep.postage_label?.label_url);

      const shipment: any = {
        orderId: order?._id ?? undefined,
        status: purchased ? "purchased" : "created",
        easypostShipmentId: ep.id,
        addressVerified: true,
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
      } else {
        unmatched++;
        console.warn(`No order match for shipment ${ep.id} to ${key}`);
      }

      await ctx.runMutation(internal.shipments.mutations.upsertShipment, { shipment });
    }

    return { total: allShipments.length, matched, unmatched };
  },
});