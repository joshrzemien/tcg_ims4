/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cron from "../cron.js";
import type * as orders_mappers_manapool from "../orders/mappers/manapool.js";
import type * as orders_mappers_shared from "../orders/mappers/shared.js";
import type * as orders_mappers_tcgplayer from "../orders/mappers/tcgplayer.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_sources_manapool from "../orders/sources/manapool.js";
import type * as orders_sources_tcgplayer from "../orders/sources/tcgplayer.js";
import type * as orders_sync from "../orders/sync.js";
import type * as orders_types from "../orders/types.js";
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
  cron: typeof cron;
  "orders/mappers/manapool": typeof orders_mappers_manapool;
  "orders/mappers/shared": typeof orders_mappers_shared;
  "orders/mappers/tcgplayer": typeof orders_mappers_tcgplayer;
  "orders/mutations": typeof orders_mutations;
  "orders/queries": typeof orders_queries;
  "orders/sources/manapool": typeof orders_sources_manapool;
  "orders/sources/tcgplayer": typeof orders_sources_tcgplayer;
  "orders/sync": typeof orders_sync;
  "orders/types": typeof orders_types;
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
