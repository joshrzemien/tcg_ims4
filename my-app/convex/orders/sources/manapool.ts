// Manapool API client.
// This file owns: how to talk to Manapool and retrieve raw order payloads.

import { inBatches } from "../../utils/async";
import { mapManapoolOrder } from "../mappers/manapool";
import type { ManapoolOrderDetail, ManapoolOrderSummary } from "../mappers/manapool";
import type { FetchOrdersOptions, OrderRecord } from "../types";

interface ManapoolOrderListResponse {
  orders: Array<ManapoolOrderSummary>;
}

interface ManapoolOrderDetailResponse {
  order: ManapoolOrderDetail;
}

interface ManapoolOrderFulfillmentRequest {
  status: "error" | "processing" | "shipped" | "delivered" | "refunded" | "replaced";
  tracking_company?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  in_transit_at?: string | null;
  estimated_delivery_at?: string | null;
  delivered_at?: string | null;
}

interface ManapoolOrderFulfillmentResponse {
  fulfillment: {
    status: string | null;
    tracking_company: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    in_transit_at: string | null;
    estimated_delivery_at: string | null;
    delivered_at: string | null;
  };
}

function buildHeaders(email: string, token: string): Record<string, string> {
  return {
    "X-ManaPool-Email": email,
    "X-ManaPool-Access-Token": token,
    "Content-Type": "application/json",
  };
}

function requireCredentials() {
  const email = process.env.MANAPOOL_EMAIL!;
  const token = process.env.MANAPOOL_ACCESS_TOKEN!;

  return {
    email,
    token,
    headers: buildHeaders(email, token),
  };
}

export async function fetchManapoolOrders(
  options: FetchOrdersOptions = {}
): Promise<Array<OrderRecord>> {
  const { headers } = requireCredentials();

  const PAGE_SIZE = 100;
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (options.unfulfilledOnly) params.set("is_fulfilled", "false");
  if (options.since) params.set("since", options.since.toISOString());

  const results: Array<OrderRecord> = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    params.set("offset", String(offset));

    const listRes = await fetch(
      `https://manapool.com/api/v1/seller/orders?${params}`,
      { headers }
    );
    if (!listRes.ok) {
      throw new Error(`Manapool list failed: ${listRes.status}`);
    }

    const { orders: summaries } = (await listRes.json()) as ManapoolOrderListResponse;
    const fetchOrderDetail = async (
      summary: ManapoolOrderSummary
    ): Promise<OrderRecord | null> => {
      const detailRes = await fetch(
        `https://manapool.com/api/v1/seller/orders/${summary.id}`,
        { headers }
      );
      if (!detailRes.ok) {
        console.error(`Failed to fetch order ${summary.id}: ${detailRes.status}`);
        return null;
      }
      const { order } = (await detailRes.json()) as ManapoolOrderDetailResponse;
      return mapManapoolOrder(order);
    };

    if (options.batchDetails) {
      const batch = await inBatches<ManapoolOrderSummary, OrderRecord>(
        summaries,
        10,
        fetchOrderDetail
      );
      results.push(...batch);
    } else {
      for (const summary of summaries) {
        const order = await fetchOrderDetail(summary);
        if (order != null) results.push(order);
      }
    }

    hasMore = summaries.length === PAGE_SIZE;
    if (hasMore) offset += PAGE_SIZE;
  }
  console.log(`Fetched ${results.length} Manapool orders`);
  return results;
}

export async function updateManapoolOrderFulfillment(args: {
  orderId: string;
  fulfillment: ManapoolOrderFulfillmentRequest;
}): Promise<ManapoolOrderFulfillmentResponse["fulfillment"]> {
  const { headers } = requireCredentials();
  const res = await fetch(
    `https://manapool.com/api/v1/seller/orders/${encodeURIComponent(args.orderId)}/fulfillment`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(args.fulfillment),
    }
  );

  if (!res.ok) {
    let message = `Manapool fulfillment update failed: ${res.status}`;
    try {
      const data = (await res.json()) as {
        message?: string;
        details?: Array<string>;
      };
      if (typeof data.message === "string" && data.message.trim() !== "") {
        message = `Manapool fulfillment update failed: ${data.message}`;
        if (Array.isArray(data.details) && data.details.length > 0) {
          message += ` (${data.details.join("; ")})`;
        }
      }
    } catch {
      // Fall back to the HTTP status-only message when the error body is absent.
    }

    throw new Error(message);
  }

  const data = (await res.json()) as ManapoolOrderFulfillmentResponse;
  return data.fulfillment;
}
