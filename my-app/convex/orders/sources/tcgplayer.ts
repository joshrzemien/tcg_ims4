// TCGPlayer API client + mapping to our internal order shape
// This file owns: how to talk to TCGPlayer, and how to transform their response
// NOTE: TCGPlayer has no official seller API. This uses their internal
// order-management API authenticated via browser session cookie.
// Session cookies expire — if sync starts failing with 401s, refresh the cookie.

const BASE_URL = "https://order-management-api.tcgplayer.com";
const API_VERSION = "2.0";
const REFERER = "https://sellerportal.tcgplayer.com/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const SEC_CH_UA =
  '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"';

  function buildHeaders(sessionCookie: string, json: boolean): Headers {
    const h = new Headers();
    h.set("Accept", "application/json, text/plain, */*");
    h.set("Cookie", sessionCookie);
    h.set("User-Agent", USER_AGENT);
    h.set("Referer", REFERER);
    h.set("sec-ch-ua", SEC_CH_UA);
    h.set("sec-ch-ua-platform", '"macOS"');
    h.set("sec-ch-ua-mobile", "?0");
    if (json) h.set("Content-Type", "application/json");
    return h;
  }

function buildUrl(path: string): string {
  return `${BASE_URL}${path}?api-version=${API_VERSION}`;
}

// -- API calls --

async function searchOrders(
  sessionCookie: string,
  sellerKey: string,
  options: { since?: Date; unfulfilledOnly?: boolean } = {}
) {
  const now = new Date();
  const since = options.since ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const body = {
    searchRange: "Custom",
    filters: {
      sellerKey,
      orderDate: {
        from: since.toISOString(),
        to: now.toISOString(),
      },
      ...(options.unfulfilledOnly && {
        orderStatuses: ["Processing", "ReadyToShip", "Received", "Pulling", "ReadyForPickup"],
      }),
    },
    sortBy: [
      { sortingType: "orderDate", direction: "ascending" as const },
    ],
    from: 0,
    size: 500,
  };

  const res = await fetch(buildUrl("/orders/search"), {
    method: "POST",
    headers: buildHeaders(sessionCookie, true),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TCGPlayer search failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { orders: any[]; totalOrders: number };
}

async function getOrderDetail(sessionCookie: string, orderNumber: string) {
  const res = await fetch(
    buildUrl(`/orders/${encodeURIComponent(orderNumber)}`),
    {
      method: "GET",
      headers: buildHeaders(sessionCookie, false),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TCGPlayer detail failed for ${orderNumber}: ${res.status} ${text}`);
  }

  return (await res.json()) as any;
}

// -- Mapping --

function dollarsToCents(amount: number | undefined | null): number {
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

function mapTcgplayerOrder(order: any) {
  const tx = order.transaction ?? {};
  const addr = order.shippingAddress ?? {};

  return {
    externalId: `tcg-${order.orderNumber}`,
    orderNumber: order.orderNumber,
    channel: "tcgplayer" as const,
    customerName: order.buyerName ?? "Unknown",
    status: (order.status ?? "pending").toLowerCase(),
    shippingMethod: order.shippingType ?? "unknown",
    shippingAddress: {
      name: addr.recipientName ?? order.buyerName ?? "Unknown",
      line1: addr.addressOne ?? "",
      ...(addr.addressTwo ? { line2: addr.addressTwo } : {}),
      city: addr.city ?? "",
      state: addr.territory ?? "",
      postalCode: addr.postalCode ?? "",
      country: addr.country ?? "US",
    },
    totalAmountCents: dollarsToCents(tx.grossAmount ?? order.totalAmount),
    shippingCostCents: dollarsToCents(tx.shippingAmount ?? order.shippingAmount),
    feeCents: dollarsToCents(tx.feeAmount),
    refundAmountCents: 0,
    itemCount: order.products?.length ?? 0,
    items: (order.products ?? []).map((item: any) => ({
      name: item.name ?? "Unknown",
      quantity: item.quantity ?? 1,
      priceCents: dollarsToCents(item.unitPrice),
      productType: "mtg_single",
      productId: String(item.productId ?? ""),
      mtgjsonId: "",
      set: "",
      languageId: "EN",
      ...(item.skuId != null && { tcgplayerSku: Number(item.skuId) }),
    })),
    createdAt: order.createdAt ? new Date(order.createdAt).getTime() : Date.now(),
    updatedAt: Date.now(),
  };
}

// -- Public --

interface FetchOptions {
  since?: Date;
  unfulfilledOnly?: boolean;
}

export async function fetchTcgplayerOrders(options: FetchOptions = {}) {
  const sessionCookie = process.env.TCGPLAYER_SESSION_COOKIE!;
  const sellerKey = process.env.TCGPLAYER_SELLER_KEY!;

  const { orders: summaries, totalOrders } = await searchOrders(
    sessionCookie,
    sellerKey,
    options
  );
  console.log(`Found ${summaries.length} of ${totalOrders} TCGPlayer orders`);

  const results = [];
  for (const summary of summaries) {
    try {
      const detail = await getOrderDetail(sessionCookie, summary.orderNumber);
      results.push(mapTcgplayerOrder(detail));
    } catch (e) {
      console.error(`Failed to fetch TCGPlayer order ${summary.orderNumber}:`, e);
      continue;
    }
  }

  return results;
}
