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
import type * as catalog_maintenance_candidateClaim from "../catalog/maintenance/candidateClaim.js";
import type * as catalog_maintenance_snapshotCleanup from "../catalog/maintenance/snapshotCleanup.js";
import type * as catalog_maintenance_stuckSyncs from "../catalog/maintenance/stuckSyncs.js";
import type * as catalog_mutations from "../catalog/mutations.js";
import type * as catalog_queries from "../catalog/queries.js";
import type * as catalog_shared_mappers from "../catalog/shared/mappers.js";
import type * as catalog_shared_syncHelpers from "../catalog/shared/syncHelpers.js";
import type * as catalog_sources_tcgtracking from "../catalog/sources/tcgtracking.js";
import type * as catalog_sync from "../catalog/sync.js";
import type * as catalog_syncCandidates from "../catalog/syncCandidates.js";
import type * as catalog_syncModes from "../catalog/syncModes.js";
import type * as catalog_syncPolicy from "../catalog/syncPolicy.js";
import type * as catalog_syncState from "../catalog/syncState.js";
import type * as catalog_workflows_metadataRefresh from "../catalog/workflows/metadataRefresh.js";
import type * as catalog_workflows_setSync from "../catalog/workflows/setSync.js";
import type * as catalog_workflows_windowSync from "../catalog/workflows/windowSync.js";
import type * as catalog_writers_categories from "../catalog/writers/categories.js";
import type * as catalog_writers_products from "../catalog/writers/products.js";
import type * as catalog_writers_sets from "../catalog/writers/sets.js";
import type * as catalog_writers_skus from "../catalog/writers/skus.js";
import type * as catalog_writers_syncState from "../catalog/writers/syncState.js";
import type * as cron from "../cron.js";
import type * as inventory_admin from "../inventory/admin.js";
import type * as inventory_contents from "../inventory/contents.js";
import type * as inventory_imports from "../inventory/imports.js";
import type * as inventory_importsSupport from "../inventory/importsSupport.js";
import type * as inventory_lib_loaders from "../inventory/lib/loaders.js";
import type * as inventory_lib_readModels from "../inventory/lib/readModels.js";
import type * as inventory_locations from "../inventory/locations.js";
import type * as inventory_model from "../inventory/model.js";
import type * as inventory_shared from "../inventory/shared.js";
import type * as inventory_stock from "../inventory/stock.js";
import type * as inventory_units from "../inventory/units.js";
import type * as lib_collections from "../lib/collections.js";
import type * as lib_ctx from "../lib/ctx.js";
import type * as lib_currency from "../lib/currency.js";
import type * as lib_printing from "../lib/printing.js";
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
import type * as pricing_admin from "../pricing/admin.js";
import type * as pricing_dashboardReadModel from "../pricing/dashboardReadModel.js";
import type * as pricing_loaders_catalogSearch from "../pricing/loaders/catalogSearch.js";
import type * as pricing_maintenance_issues from "../pricing/maintenance/issues.js";
import type * as pricing_mutations from "../pricing/mutations.js";
import type * as pricing_normalizers from "../pricing/normalizers.js";
import type * as pricing_queries from "../pricing/queries.js";
import type * as pricing_readModels_issues from "../pricing/readModels/issues.js";
import type * as pricing_readModels_pagination from "../pricing/readModels/pagination.js";
import type * as pricing_readModels_rulesDashboard from "../pricing/readModels/rulesDashboard.js";
import type * as pricing_readModels_trackedSeries from "../pricing/readModels/trackedSeries.js";
import type * as pricing_ruleScope from "../pricing/ruleScope.js";
import type * as pricing_shared_keys from "../pricing/shared/keys.js";
import type * as pricing_sync from "../pricing/sync.js";
import type * as pricing_workflows_coverageRefresh from "../pricing/workflows/coverageRefresh.js";
import type * as pricing_workflows_ensureTrackedSet from "../pricing/workflows/ensureTrackedSet.js";
import type * as pricing_workflows_snapshotCapture from "../pricing/workflows/snapshotCapture.js";
import type * as pricing_writers_dashboard from "../pricing/writers/dashboard.js";
import type * as pricing_writers_issues from "../pricing/writers/issues.js";
import type * as pricing_writers_rules from "../pricing/writers/rules.js";
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
  "catalog/maintenance/candidateClaim": typeof catalog_maintenance_candidateClaim;
  "catalog/maintenance/snapshotCleanup": typeof catalog_maintenance_snapshotCleanup;
  "catalog/maintenance/stuckSyncs": typeof catalog_maintenance_stuckSyncs;
  "catalog/mutations": typeof catalog_mutations;
  "catalog/queries": typeof catalog_queries;
  "catalog/shared/mappers": typeof catalog_shared_mappers;
  "catalog/shared/syncHelpers": typeof catalog_shared_syncHelpers;
  "catalog/sources/tcgtracking": typeof catalog_sources_tcgtracking;
  "catalog/sync": typeof catalog_sync;
  "catalog/syncCandidates": typeof catalog_syncCandidates;
  "catalog/syncModes": typeof catalog_syncModes;
  "catalog/syncPolicy": typeof catalog_syncPolicy;
  "catalog/syncState": typeof catalog_syncState;
  "catalog/workflows/metadataRefresh": typeof catalog_workflows_metadataRefresh;
  "catalog/workflows/setSync": typeof catalog_workflows_setSync;
  "catalog/workflows/windowSync": typeof catalog_workflows_windowSync;
  "catalog/writers/categories": typeof catalog_writers_categories;
  "catalog/writers/products": typeof catalog_writers_products;
  "catalog/writers/sets": typeof catalog_writers_sets;
  "catalog/writers/skus": typeof catalog_writers_skus;
  "catalog/writers/syncState": typeof catalog_writers_syncState;
  cron: typeof cron;
  "inventory/admin": typeof inventory_admin;
  "inventory/contents": typeof inventory_contents;
  "inventory/imports": typeof inventory_imports;
  "inventory/importsSupport": typeof inventory_importsSupport;
  "inventory/lib/loaders": typeof inventory_lib_loaders;
  "inventory/lib/readModels": typeof inventory_lib_readModels;
  "inventory/locations": typeof inventory_locations;
  "inventory/model": typeof inventory_model;
  "inventory/shared": typeof inventory_shared;
  "inventory/stock": typeof inventory_stock;
  "inventory/units": typeof inventory_units;
  "lib/collections": typeof lib_collections;
  "lib/ctx": typeof lib_ctx;
  "lib/currency": typeof lib_currency;
  "lib/printing": typeof lib_printing;
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
  "pricing/admin": typeof pricing_admin;
  "pricing/dashboardReadModel": typeof pricing_dashboardReadModel;
  "pricing/loaders/catalogSearch": typeof pricing_loaders_catalogSearch;
  "pricing/maintenance/issues": typeof pricing_maintenance_issues;
  "pricing/mutations": typeof pricing_mutations;
  "pricing/normalizers": typeof pricing_normalizers;
  "pricing/queries": typeof pricing_queries;
  "pricing/readModels/issues": typeof pricing_readModels_issues;
  "pricing/readModels/pagination": typeof pricing_readModels_pagination;
  "pricing/readModels/rulesDashboard": typeof pricing_readModels_rulesDashboard;
  "pricing/readModels/trackedSeries": typeof pricing_readModels_trackedSeries;
  "pricing/ruleScope": typeof pricing_ruleScope;
  "pricing/shared/keys": typeof pricing_shared_keys;
  "pricing/sync": typeof pricing_sync;
  "pricing/workflows/coverageRefresh": typeof pricing_workflows_coverageRefresh;
  "pricing/workflows/ensureTrackedSet": typeof pricing_workflows_ensureTrackedSet;
  "pricing/workflows/snapshotCapture": typeof pricing_workflows_snapshotCapture;
  "pricing/writers/dashboard": typeof pricing_writers_dashboard;
  "pricing/writers/issues": typeof pricing_writers_issues;
  "pricing/writers/rules": typeof pricing_writers_rules;
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
