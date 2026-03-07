import type { ShippingStatus } from "../../shared/shippingStatus";
import type { ShippingMethod } from "../../shared/shippingMethod";

export type OrderChannel = "manapool" | "tcgplayer" | "seeded";

export interface FetchOrdersOptions {
  since?: Date;
  unfulfilledOnly?: boolean;
  batchDetails?: boolean;
}

export interface OrderAddressRecord {
  name: string;
  line1: string;
  line2?: string;
  line3?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItemRecord {
  name: string;
  quantity: number;
  productId: string;
  mtgjsonId: string;
  priceCents: number;
  productType: string;
  set: string;
  conditionId?: string;
  finishId?: string;
  languageId: string;
  collectorNumber?: string;
  scryfallId?: string;
  tcgplayerSku?: number;
  catalogProductKey?: string;
  catalogSkuKey?: string;
}

export interface OrderRecord {
  externalId: string;
  orderNumber: string;
  channel: OrderChannel;
  customerName: string;
  status: ShippingStatus;
  shippingStatus: ShippingStatus;
  fulfillmentStatus?: boolean;
  shippingMethod: ShippingMethod;
  shippingAddress: OrderAddressRecord;
  totalAmountCents: number;
  shippingCostCents: number;
  feeCents: number;
  refundAmountCents: number;
  itemCount: number;
  items: Array<OrderItemRecord>;
  createdAt: number;
  updatedAt: number;
}
