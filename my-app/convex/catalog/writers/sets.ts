import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import {
  refreshRuleDashboardFieldsForCategory,
  refreshRuleDashboardFieldsForProductKeys,
  refreshRuleDashboardFieldsForSet,
} from '../../pricing/dashboardReadModel'
import {
  buildRuleScopeState,
  computeHasSourceChanges,
  hasSetSourceChanged,
  isSetInDerivedRuleScope,
  latestSourceTimestamp,
  normalizeOptionalString,
} from '../shared/syncHelpers'

export const upsertSetsBatch = internalMutation({
  args: {
    sets: v.array(v.any()),
  },
  handler: async (ctx, { sets }) => {
    let inserted = 0
    let updated = 0
    const touchedSetKeys = new Set<string>()
    const touchedCategoryKeys = new Set<string>()
    const touchedProductKeys = new Set<string>()
    const activeRules = await ctx.db
      .query('pricingTrackingRules')
      .withIndex('by_active', (q: any) => q.eq('active', true))
      .collect()
    const ruleScopeState = buildRuleScopeState(activeRules)

    for (const incoming of sets) {
      touchedSetKeys.add(incoming.key)
      touchedCategoryKeys.add(incoming.categoryKey)
      const existing = await ctx.db
        .query('catalogSets')
        .withIndex('by_key', (q) => q.eq('key', incoming.key))
        .unique()

      const nextUpdatedAt = incoming.updatedAt
      const sourceTimestamp = latestSourceTimestamp(incoming)
      const inRuleScope = isSetInDerivedRuleScope(
        incoming,
        ruleScopeState,
        existing?._creationTime ?? Date.now(),
      )
      const isStale =
        typeof sourceTimestamp === 'number' &&
        typeof existing?.lastSyncedAt === 'number' &&
        sourceTimestamp > existing.lastSyncedAt
      const hasSourceChanged = existing
        ? hasSetSourceChanged(existing, incoming)
        : false

      if (existing) {
        const shouldResetSyncState =
          isStale ||
          (!existing.lastSyncedAt && existing.syncStatus !== 'error') ||
          (existing.syncStatus === 'error' && hasSourceChanged)

        await ctx.db.patch('catalogSets', existing._id, {
          categoryKey: incoming.categoryKey,
          tcgtrackingCategoryId: incoming.tcgtrackingCategoryId,
          categoryDisplayName: incoming.categoryDisplayName,
          tcgtrackingSetId: incoming.tcgtrackingSetId,
          name: incoming.name,
          abbreviation: incoming.abbreviation,
          publishedOn: incoming.publishedOn,
          modifiedOn: incoming.modifiedOn,
          productCount: incoming.productCount,
          skuCount: incoming.skuCount,
          productsModifiedAt: incoming.productsModifiedAt,
          pricingModifiedAt: incoming.pricingModifiedAt,
          skusModifiedAt: incoming.skusModifiedAt,
          ...(existing.syncStatus === 'syncing'
            ? {}
            : shouldResetSyncState
              ? {
                  syncStatus: 'pending' as const,
                  nextSyncAttemptAt: undefined,
                  consecutiveSyncFailures: undefined,
                  lastSyncError: undefined,
                }
              : {
                  syncStatus: existing.syncStatus,
                  nextSyncAttemptAt: existing.nextSyncAttemptAt,
                  consecutiveSyncFailures: existing.consecutiveSyncFailures,
                  lastSyncError: normalizeOptionalString(
                    existing.lastSyncError,
                  ),
                }),
          pricingSyncStatus: existing.pricingSyncStatus,
          currentPricingSyncStartedAt: existing.currentPricingSyncStartedAt,
          lastPricingSyncError: normalizeOptionalString(
            existing.lastPricingSyncError,
          ),
          pendingSyncMode: existing.pendingSyncMode,
          inRuleScope,
          hasCompletedSync: typeof existing.lastSyncedAt === 'number',
          latestSourceUpdatedAt: sourceTimestamp,
          hasSourceChanges: computeHasSourceChanges({
            inRuleScope,
            latestSourceUpdatedAt: sourceTimestamp,
            lastSyncedAt: existing.lastSyncedAt,
          }),
          activeTrackedSeriesCount: existing.activeTrackedSeriesCount,
          hasActiveTrackedSeries: existing.hasActiveTrackedSeries,
          syncedProductCount: existing.syncedProductCount,
          syncedSkuCount: existing.syncedSkuCount,
          updatedAt: nextUpdatedAt,
        })
        updated += 1
      } else {
        await ctx.db.insert('catalogSets', {
          ...incoming,
          syncStatus: 'pending',
          pricingSyncStatus: 'idle',
          inRuleScope,
          hasCompletedSync: false,
          latestSourceUpdatedAt: sourceTimestamp,
          hasSourceChanges: false,
          activeTrackedSeriesCount: 0,
          hasActiveTrackedSeries: false,
          syncedProductCount: 0,
          syncedSkuCount: 0,
        })
        inserted += 1
      }
    }

    for (const setKey of touchedSetKeys) {
      await refreshRuleDashboardFieldsForSet(ctx, setKey)
      const products = await ctx.db
        .query('catalogProducts')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect()
      for (const product of products) {
        touchedProductKeys.add(product.key)
      }
    }
    for (const categoryKey of touchedCategoryKeys) {
      await refreshRuleDashboardFieldsForCategory(ctx, categoryKey)
    }
    await refreshRuleDashboardFieldsForProductKeys(
      ctx,
      [...touchedProductKeys],
    )

    return {
      inserted,
      updated,
    }
  },
})
