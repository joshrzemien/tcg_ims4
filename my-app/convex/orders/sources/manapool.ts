// Manapool API client + mapping to our internal order shape
// This file owns: how to talk to Manapool, and how to transform their response

interface ManapoolOrderDetail {
    id: string;
    created_at: string;
    shipping_address: any;
    latest_fulfillment_status: string | null;
    shipping_method: string;
    payment: any;
    items: any[];
  }
  
  function mapManapoolOrder(order: ManapoolOrderDetail) {
    return {
      externalId: order.id,
      orderNumber: order.id,
      channel: "manapool" as const,
      customerName: order.shipping_address.name,
      status: order.latest_fulfillment_status ?? "pending",
      shippingMethod: order.shipping_method,
      shippingAddress: {
        name: order.shipping_address.name,
        line1: order.shipping_address.line1,
        ...(order.shipping_address.line2 && { line2: order.shipping_address.line2 }),
        ...(order.shipping_address.line3 && { line3: order.shipping_address.line3 }),
        city: order.shipping_address.city,
        state: order.shipping_address.state,
        postalCode: order.shipping_address.postal_code,
        country: order.shipping_address.country,
      },
      totalAmountCents: order.payment.total_cents,
      shippingCostCents: order.payment.shipping_cents,
      feeCents: order.payment.fee_cents,
      refundAmountCents: 0,
      itemCount: order.items.length,
      items: order.items.map((item: any) => {
        const isSingle = item.product_type === "mtg_single";
        const productData = isSingle ? item.product.single : item.product.sealed;
        return {
          name: productData?.name ?? "Unknown",
          quantity: item.quantity,
          priceCents: item.price_cents,
          productType: item.product_type,
          productId: item.product_id,
          mtgjsonId: productData?.mtgjson_id ?? "",
          set: productData?.set ?? "",
          languageId: productData?.language_id ?? "EN",
          ...(isSingle && productData && {
            conditionId: productData.condition_id,
            finishId: productData.finish_id,
            collectorNumber: productData.number,
            scryfallId: productData.scryfall_id,
          }),
          ...(item.tcgsku != null && { tcgplayerSku: item.tcgsku }),
        };
      }),
      createdAt: new Date(order.created_at).getTime(),
      updatedAt: Date.now(),
    };
  }
  
  interface FetchOptions {
    since?: Date;
    unfulfilledOnly?: boolean;
  }
  
  export async function fetchManapoolOrders(options: FetchOptions = {}) {
    const email = process.env.MANAPOOL_EMAIL!;
    const token = process.env.MANAPOOL_ACCESS_TOKEN!;
    const headers = {
      "X-ManaPool-Email": email,
      "X-ManaPool-Access-Token": token,
    };
  
    const params = new URLSearchParams({ limit: "100" });
    if (options.unfulfilledOnly) {
      params.set("is_fulfilled", "false");
    }
    if (options.since) {
      params.set("since", options.since.toISOString());
    }
  
    const listRes = await fetch(
      `https://manapool.com/api/v1/seller/orders?${params}`,
      { headers }
    );
  
    if (!listRes.ok) {
      throw new Error(`Manapool list failed: ${listRes.status} ${await listRes.text()}`);
    }
  
    const { orders: summaries } = await listRes.json();
    console.log(`Found ${summaries.length} Manapool orders`);
  
    const results = [];
    for (const summary of summaries) {
      const detailRes = await fetch(
        `https://manapool.com/api/v1/seller/orders/${summary.id}`,
        { headers }
      );
  
      if (!detailRes.ok) {
        console.error(`Failed to fetch order ${summary.id}: ${detailRes.status}`);
        continue;
      }
  
      const { order } = await detailRes.json();
      results.push(mapManapoolOrder(order));
    }
  
    return results;
  }
  
  