import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import {
  computeHasSourceChanges,
  getRetryDelayMs,
  isSetProcessing,
  setSyncModeValidator,
} from '../shared/syncHelpers'
import { pickHigherPrioritySyncMode } from '../syncModes'

export const markSetSyncStarted = internalMutation({
  args: {
    setKey: v.string(),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { setKey, syncStartedAt }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'syncing',
      currentSyncStartedAt: syncStartedAt,
      nextSyncAttemptAt: undefined,
      lastSyncError: undefined,
      updatedAt: syncStartedAt,
    })
  },
})

export const markSetSyncCompleted = internalMutation({
  args: {
    setKey: v.string(),
    completedAt: v.number(),
    syncedProductCount: v.number(),
    syncedSkuCount: v.number(),
  },
  handler: async (
    ctx,
    { setKey, completedAt, syncedProductCount, syncedSkuCount },
  ) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'ready',
      currentSyncStartedAt: undefined,
      lastSyncedAt: completedAt,
      lastSyncError: undefined,
      nextSyncAttemptAt: undefined,
      consecutiveSyncFailures: undefined,
      hasCompletedSync: true,
      hasSourceChanges: computeHasSourceChanges({
        inRuleScope: existing.inRuleScope,
        latestSourceUpdatedAt: existing.latestSourceUpdatedAt,
        lastSyncedAt: completedAt,
      }),
      syncedProductCount,
      syncedSkuCount,
      updatedAt: completedAt,
    })
  },
})

export const markSetSyncFailed = internalMutation({
  args: {
    setKey: v.string(),
    failedAt: v.number(),
    message: v.string(),
  },
  handler: async (ctx, { setKey, failedAt, message }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const consecutiveSyncFailures = (existing.consecutiveSyncFailures ?? 0) + 1

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'error',
      currentSyncStartedAt: undefined,
      lastSyncError: message,
      nextSyncAttemptAt: failedAt + getRetryDelayMs(consecutiveSyncFailures),
      consecutiveSyncFailures,
      updatedAt: failedAt,
    })
  },
})

export const markPricingSyncStarted = internalMutation({
  args: {
    setKey: v.string(),
    syncStartedAt: v.number(),
  },
  handler: async (ctx, { setKey, syncStartedAt }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      pricingSyncStatus: 'syncing',
      currentPricingSyncStartedAt: syncStartedAt,
      lastPricingSyncError: undefined,
      updatedAt: syncStartedAt,
    })
  },
})

export const markPricingSyncCompleted = internalMutation({
  args: {
    setKey: v.string(),
    completedAt: v.number(),
  },
  handler: async (ctx, { setKey, completedAt }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      pricingSyncStatus: 'idle',
      currentPricingSyncStartedAt: undefined,
      lastPricingSyncError: undefined,
      updatedAt: completedAt,
    })
  },
})

export const markPricingSyncFailed = internalMutation({
  args: {
    setKey: v.string(),
    failedAt: v.number(),
    message: v.string(),
  },
  handler: async (ctx, { setKey, failedAt, message }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      pricingSyncStatus: 'error',
      currentPricingSyncStartedAt: undefined,
      lastPricingSyncError: message,
      updatedAt: failedAt,
    })
  },
})

export const requestSetSync = internalMutation({
  args: {
    setKey: v.string(),
    mode: setSyncModeValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { setKey, mode }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const now = Date.now()

    if (isSetProcessing(existing)) {
      const nextPendingMode = pickHigherPrioritySyncMode(
        existing.pendingSyncMode,
        mode,
      )

      if (nextPendingMode !== existing.pendingSyncMode) {
        await ctx.db.patch('catalogSets', existing._id, {
          pendingSyncMode: nextPendingMode,
          updatedAt: now,
        })
      }

      return {
        scheduled: false,
        mode: nextPendingMode,
      }
    }

    if (mode === 'full') {
      await ctx.db.patch('catalogSets', existing._id, {
        syncStatus: 'syncing',
        currentSyncStartedAt: now,
        nextSyncAttemptAt: undefined,
        lastSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch('catalogSets', existing._id, {
        pricingSyncStatus: 'syncing',
        currentPricingSyncStartedAt: now,
        lastPricingSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    }

    return {
      scheduled: true,
      mode,
    }
  },
})

export const consumePendingSyncMode = internalMutation({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing || !existing.pendingSyncMode || isSetProcessing(existing)) {
      return {
        mode: null,
      }
    }

    const now = Date.now()
    const mode = existing.pendingSyncMode

    if (mode === 'full') {
      await ctx.db.patch('catalogSets', existing._id, {
        syncStatus: 'syncing',
        currentSyncStartedAt: now,
        nextSyncAttemptAt: undefined,
        lastSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch('catalogSets', existing._id, {
        pricingSyncStatus: 'syncing',
        currentPricingSyncStartedAt: now,
        lastPricingSyncError: undefined,
        pendingSyncMode: undefined,
        updatedAt: now,
      })
    }

    return { mode }
  },
})

export const recordSetScopeCleanup = internalMutation({
  args: {
    setKey: v.string(),
    cleanedAt: v.number(),
  },
  handler: async (ctx, { setKey, cleanedAt }) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      syncStatus: 'ready',
      currentSyncStartedAt: undefined,
      lastSyncedAt: undefined,
      lastSyncError: undefined,
      nextSyncAttemptAt: undefined,
      consecutiveSyncFailures: undefined,
      inRuleScope: false,
      hasCompletedSync: false,
      hasSourceChanges: false,
      activeTrackedSeriesCount: 0,
      hasActiveTrackedSeries: false,
      syncedProductCount: 0,
      syncedSkuCount: 0,
      updatedAt: cleanedAt,
    })
  },
})

export const recordSetPricingScopeState = internalMutation({
  args: {
    setKey: v.string(),
    inRuleScope: v.boolean(),
    activeTrackedSeriesCount: v.number(),
    updatedAt: v.number(),
  },
  handler: async (
    ctx,
    { setKey, inRuleScope, activeTrackedSeriesCount, updatedAt },
  ) => {
    const existing = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!existing) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    await ctx.db.patch('catalogSets', existing._id, {
      inRuleScope,
      activeTrackedSeriesCount,
      hasActiveTrackedSeries: activeTrackedSeriesCount > 0,
      hasSourceChanges: computeHasSourceChanges({
        inRuleScope,
        latestSourceUpdatedAt: existing.latestSourceUpdatedAt,
        lastSyncedAt: existing.lastSyncedAt,
      }),
      updatedAt,
    })
  },
})
