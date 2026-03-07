/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog_config from "../catalog/config.js";
import type * as catalog_mutations from "../catalog/mutations.js";
import type * as catalog_queries from "../catalog/queries.js";
import type * as catalog_sources_tcgtracking from "../catalog/sources/tcgtracking.js";
import type * as catalog_sync from "../catalog/sync.js";
import type * as catalog_syncState from "../catalog/syncState.js";
import type * as cron from "../cron.js";
import type * as orders_actions from "../orders/actions.js";
import type * as orders_mappers_manapool from "../orders/mappers/manapool.js";
import type * as orders_mappers_shared from "../orders/mappers/shared.js";
import type * as orders_mappers_tcgplayer from "../orders/mappers/tcgplayer.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_shipmentSummary from "../orders/shipmentSummary.js";
import type * as orders_sources_manapool from "../orders/sources/manapool.js";
import type * as orders_sources_tcgplayer from "../orders/sources/tcgplayer.js";
import type * as orders_sync from "../orders/sync.js";
import type * as orders_types from "../orders/types.js";
import type * as pricing_mutations from "../pricing/mutations.js";
import type * as pricing_normalizers from "../pricing/normalizers.js";
import type * as pricing_queries from "../pricing/queries.js";
import type * as pricing_sync from "../pricing/sync.js";
import type * as shipments_actions from "../shipments/actions.js";
import type * as shipments_mutations from "../shipments/mutations.js";
import type * as shipments_queries from "../shipments/queries.js";
import type * as shipments_sources_easypost from "../shipments/sources/easypost.js";
import type * as shipments_sync from "../shipments/sync.js";
import type * as shipments_types from "../shipments/types.js";
import type * as utils_async from "../utils/async.js";
import type * as utils_shippingStatus from "../utils/shippingStatus.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "catalog/config": typeof catalog_config;
  "catalog/mutations": typeof catalog_mutations;
  "catalog/queries": typeof catalog_queries;
  "catalog/sources/tcgtracking": typeof catalog_sources_tcgtracking;
  "catalog/sync": typeof catalog_sync;
  "catalog/syncState": typeof catalog_syncState;
  cron: typeof cron;
  "orders/actions": typeof orders_actions;
  "orders/mappers/manapool": typeof orders_mappers_manapool;
  "orders/mappers/shared": typeof orders_mappers_shared;
  "orders/mappers/tcgplayer": typeof orders_mappers_tcgplayer;
  "orders/mutations": typeof orders_mutations;
  "orders/queries": typeof orders_queries;
  "orders/shipmentSummary": typeof orders_shipmentSummary;
  "orders/sources/manapool": typeof orders_sources_manapool;
  "orders/sources/tcgplayer": typeof orders_sources_tcgplayer;
  "orders/sync": typeof orders_sync;
  "orders/types": typeof orders_types;
  "pricing/mutations": typeof pricing_mutations;
  "pricing/normalizers": typeof pricing_normalizers;
  "pricing/queries": typeof pricing_queries;
  "pricing/sync": typeof pricing_sync;
  "shipments/actions": typeof shipments_actions;
  "shipments/mutations": typeof shipments_mutations;
  "shipments/queries": typeof shipments_queries;
  "shipments/sources/easypost": typeof shipments_sources_easypost;
  "shipments/sync": typeof shipments_sync;
  "shipments/types": typeof shipments_types;
  "utils/async": typeof utils_async;
  "utils/shippingStatus": typeof utils_shippingStatus;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
