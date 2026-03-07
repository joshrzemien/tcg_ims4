// TCGPlayer API client.
// This file owns: how to talk to TCGPlayer and retrieve raw order payloads.
// NOTE: TCGPlayer has no official seller API. This uses their internal
// order-management API authenticated via browser session cookie.
// Session cookies expire — if sync starts failing with 401s, refresh the cookie.

import { inBatches } from "../../utils/async";
import { mapTcgplayerOrder } from "../mappers/tcgplayer";
import type { TcgplayerOrderDetail } from "../mappers/tcgplayer";
import type { FetchOrdersOptions, OrderRecord } from "../types";

const BASE_URL = "https://order-management-api.tcgplayer.com";
const API_VERSION = "2.0";
const REFERER = "https://sellerportal.tcgplayer.com/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const SEC_CH_UA =
  '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"';

interface TcgplayerOrderSummary {
  orderNumber: string;
}

interface TcgplayerPullSheetRequest {
  sortingType: "ByRelease";
  format: "Default";
  timezoneOffset: number;
  orderNumbers: Array<string>;
}

interface TcgplayerPackingSlipRequest {
  timezoneOffset: number;
  orderNumbers: Array<string>;
}

export interface TcgplayerExportedDocument {
  base64Data: string;
  fileName?: string;
  mimeType: string;
}

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

function parseContentDispositionFileName(
  contentDisposition: string | null
): string | undefined {
  if (!contentDisposition) {
    return undefined;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return undefined;
}

function inferMimeType(
  fileName: string | undefined,
  contentType: string | null
): string {
  if (contentType && contentType !== "application/octet-stream") {
    return contentType;
  }

  const lowerFileName = fileName?.toLowerCase();
  if (lowerFileName?.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerFileName?.endsWith(".csv")) {
    return "text/csv;charset=utf-8";
  }

  return contentType ?? "application/octet-stream";
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, start + chunkSize);
    for (const byte of chunk) {
      binary += String.fromCharCode(byte);
    }
  }

  return btoa(binary);
}

async function readExportDocumentResponse(
  res: Response,
  label: string
): Promise<TcgplayerExportedDocument> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TCGPlayer ${label} export failed: ${res.status} ${text}`);
  }

  const contentDisposition = res.headers.get("content-disposition");
  const fileName = parseContentDispositionFileName(contentDisposition);
  const mimeType = inferMimeType(fileName, res.headers.get("content-type"));
  const arrayBuffer = await res.arrayBuffer();

  if (arrayBuffer.byteLength === 0) {
    throw new Error(`TCGPlayer ${label} export returned an empty response.`);
  }

  return {
    base64Data: arrayBufferToBase64(arrayBuffer),
    ...(fileName ? { fileName } : {}),
    mimeType,
  };
}

// -- API calls --

async function searchOrders(
  sessionCookie: string,
  sellerKey: string,
  options: FetchOrdersOptions = {},
  from = 0,
  size = 500
): Promise<{ orders: Array<TcgplayerOrderSummary>; totalOrders: number }> {
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
    from,
    size,
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

  return (await res.json()) as {
    orders: Array<TcgplayerOrderSummary>;
    totalOrders: number;
  };
}

async function getOrderDetail(
  sessionCookie: string,
  orderNumber: string
): Promise<TcgplayerOrderDetail> {
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

  return (await res.json()) as TcgplayerOrderDetail;
}

async function exportPullSheetsDocument(
  sessionCookie: string,
  request: TcgplayerPullSheetRequest
): Promise<TcgplayerExportedDocument> {
  const res = await fetch(buildUrl("/orders/pull-sheets/export"), {
    method: "POST",
    headers: buildHeaders(sessionCookie, true),
    body: JSON.stringify(request),
  });

  return readExportDocumentResponse(res, "pull sheets");
}

async function exportPackingSlipsDocument(
  sessionCookie: string,
  request: TcgplayerPackingSlipRequest
): Promise<TcgplayerExportedDocument> {
  const res = await fetch(buildUrl("/orders/packing-slips/export"), {
    method: "POST",
    headers: buildHeaders(sessionCookie, true),
    body: JSON.stringify(request),
  });

  return readExportDocumentResponse(res, "packing slips");
}

// -- Public --

export async function fetchTcgplayerOrders(
  options: FetchOrdersOptions = {}
): Promise<Array<OrderRecord>> {
  const sessionCookie = process.env.TCGPLAYER_SESSION_COOKIE!;
  const sellerKey = process.env.TCGPLAYER_SELLER_KEY!;

  const PAGE_SIZE = 500;
  let from = 0;
  let totalOrders = 0;
  const summaries: Array<TcgplayerOrderSummary> = [];

  for (;;) {
    const page = await searchOrders(sessionCookie, sellerKey, options, from, PAGE_SIZE);
    totalOrders = page.totalOrders;
    summaries.push(...page.orders);
    from += page.orders.length;
    if (page.orders.length < PAGE_SIZE || summaries.length >= totalOrders) break;
  }

  console.log(`Found ${summaries.length} of ${totalOrders} TCGPlayer orders`);

  const fetchOrderDetail = async (
    summary: TcgplayerOrderSummary
  ): Promise<OrderRecord | null> => {
    try {
      const detail = await getOrderDetail(sessionCookie, summary.orderNumber);
      return mapTcgplayerOrder(detail);
    } catch (e) {
      console.error(`Failed to fetch TCGPlayer order ${summary.orderNumber}:`, e);
      return null;
    }
  };

  const results: Array<OrderRecord> = [];
  if (options.batchDetails) {
    const batch = await inBatches<TcgplayerOrderSummary, OrderRecord>(
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

  return results;
}

export async function exportTcgplayerPullSheets(args: {
  orderNumbers: Array<string>;
  timezoneOffset: number;
}): Promise<TcgplayerExportedDocument> {
  const sessionCookie = process.env.TCGPLAYER_SESSION_COOKIE!;

  return exportPullSheetsDocument(sessionCookie, {
    sortingType: "ByRelease",
    format: "Default",
    timezoneOffset: args.timezoneOffset,
    orderNumbers: args.orderNumbers,
  });
}

export async function exportTcgplayerPackingSlips(args: {
  orderNumbers: Array<string>;
  timezoneOffset: number;
}): Promise<TcgplayerExportedDocument> {
  const sessionCookie = process.env.TCGPLAYER_SESSION_COOKIE!;

  return exportPackingSlipsDocument(sessionCookie, {
    timezoneOffset: args.timezoneOffset,
    orderNumbers: args.orderNumbers,
  });
}
