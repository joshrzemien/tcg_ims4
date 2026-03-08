import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation, mutation } from '../_generated/server'
import {
  buildIssueKey,
  buildSeriesKey,
  getTrackedPrintingDefinitions,
  resolveSeriesSnapshot,
} from './normalizers'
import { categoryRuleAppliesToSet } from './ruleScope'
import type { Doc, Id } from '../_generated/dataModel'

type TrackingRuleDoc = Doc<'pricingTrackingRules'>
type CatalogSetDoc = Doc<'catalogSets'>
type PricingMutationCtx = any

function buildSyncIssueKey(setKey: string) {
  return `sync:${setKey}`
}

async function loadRelevantRulesForSet(
  ctx: PricingMutationCtx,
  set: CatalogSetDoc,
  products: Array<Doc<'catalogProducts'>>,
) {
  const productKeySet = new Set(products.map((product) => product.key))
  const [setRules, categoryRules, manualRules] = await Promise.all([
    ctx.db
      .query('pricingTrackingRules')
      .withIndex('by_active_setKey', (q: any) =>
        q.eq('active', true).eq('setKey', set.key),
      )
      .collect(),
    ctx.db
      .query('pricingTrackingRules')
      .withIndex('by_active_categoryKey', (q: any) =>
        q.eq('active', true).eq('categoryKey', set.categoryKey),
      )
      .collect(),
    ctx.db
      .query('pricingTrackingRules')
      .withIndex('by_ruleType_active', (q: any) =>
        q.eq('ruleType', 'manual_product').eq('active', true),
      )
      .collect(),
  ])

  const applicableCategoryRules = categoryRules.filter(
    (rule: TrackingRuleDoc) => categoryRuleAppliesToSet(rule, set),
  )
  const manualRulesByProductKey = new Map<string, Array<TrackingRuleDoc>>()

  for (const rule of manualRules) {
    if (
      typeof rule.catalogProductKey !== 'string' ||
      !productKeySet.has(rule.catalogProductKey)
    ) {
      continue
    }

    const productRules =
      manualRulesByProductKey.get(rule.catalogProductKey) ?? []
    productRules.push(rule)
    manualRulesByProductKey.set(rule.catalogProductKey, productRules)
  }

  return {
    setRules,
    categoryRules: applicableCategoryRules,
    manualRulesByProductKey,
  }
}

function buildDefaultRuleLabel(params: {
  ruleType: TrackingRuleDoc['ruleType']
  name: string
}) {
  if (params.ruleType === 'manual_product') {
    return `Track ${params.name}`
  }

  if (params.ruleType === 'set') {
    return `Track set ${params.name}`
  }

  return `Track category ${params.name}`
}

function seriesNeedsPatch(
  existing: Doc<'pricingTrackedSeries'>,
  desired: {
    catalogProductKey: string
    categoryKey: string
    setKey: string
    tcgtrackingCategoryId: number
    tcgtrackingSetId: number
    tcgplayerProductId: number
    name: string
    number?: string
    rarity?: string
    printingKey: string
    printingLabel: string
    skuVariantCode?: string
    activeRuleCount: number
    active: boolean
  },
) {
  return (
    existing.catalogProductKey !== desired.catalogProductKey ||
    existing.categoryKey !== desired.categoryKey ||
    existing.setKey !== desired.setKey ||
    existing.tcgtrackingCategoryId !== desired.tcgtrackingCategoryId ||
    existing.tcgtrackingSetId !== desired.tcgtrackingSetId ||
    existing.tcgplayerProductId !== desired.tcgplayerProductId ||
    existing.name !== desired.name ||
    existing.number !== desired.number ||
    existing.rarity !== desired.rarity ||
    existing.printingKey !== desired.printingKey ||
    existing.printingLabel !== desired.printingLabel ||
    existing.skuVariantCode !== desired.skuVariantCode ||
    existing.activeRuleCount !== desired.activeRuleCount ||
    existing.active !== desired.active
  )
}

function joinNeedsPatch(
  existing: Doc<'pricingTrackedSeriesRules'>,
  desired: {
    ruleId: Id<'pricingTrackingRules'>
    seriesKey: string
    catalogProductKey: string
    setKey: string
    categoryKey: string
  },
) {
  return (
    existing.ruleId !== desired.ruleId ||
    existing.seriesKey !== desired.seriesKey ||
    existing.catalogProductKey !== desired.catalogProductKey ||
    existing.setKey !== desired.setKey ||
    existing.categoryKey !== desired.categoryKey ||
    !existing.active
  )
}

export const enqueueRuleAffectedSetSyncs = internalMutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
  },
  handler: async (ctx, { ruleId }) => {
    const [rule, existingJoins] = await Promise.all([
      ctx.db.get('pricingTrackingRules', ruleId),
      ctx.db
        .query('pricingTrackedSeriesRules')
        .withIndex('by_ruleId', (q: any) => q.eq('ruleId', ruleId))
        .collect(),
    ])

    const setKeys = new Set(existingJoins.map((join) => join.setKey))

    if (rule?.active) {
      if (rule.ruleType === 'manual_product' && rule.catalogProductKey) {
        const product = await ctx.db
          .query('catalogProducts')
          .withIndex('by_key', (q: any) => q.eq('key', rule.catalogProductKey!))
          .unique()

        if (product) {
          setKeys.add(product.setKey)
        }
      } else if (rule.ruleType === 'set' && rule.setKey) {
        setKeys.add(rule.setKey)
      } else if (rule.ruleType === 'category' && rule.categoryKey) {
        const sets = await ctx.db
          .query('catalogSets')
          .withIndex('by_categoryKey', (q: any) =>
            q.eq('categoryKey', rule.categoryKey!),
          )
          .collect()

        for (const set of sets) {
          if (categoryRuleAppliesToSet(rule, set)) {
            setKeys.add(set.key)
          }
        }
      }
    }

    for (const setKey of setKeys) {
      await ctx.scheduler.runAfter(0, internal.catalog.sync.requestSetSync, {
        setKey,
        mode: 'pricing_only',
        reason: 'pricing_rule_change',
      })
    }

    return { scheduled: setKeys.size }
  },
})

export const refreshTrackedCoverageForSetMutation = internalMutation({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }) => {
    const now = Date.now()
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      return { setKey, series: 0, joins: 0 }
    }

    const [products, existingSeries, existingJoins] = await Promise.all([
      ctx.db
        .query('catalogProducts')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
      ctx.db
        .query('pricingTrackedSeries')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
      ctx.db
        .query('pricingTrackedSeriesRules')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
    ])
    const relevantRules = await loadRelevantRulesForSet(ctx, set, products)
    const sharedRules = [
      ...relevantRules.setRules,
      ...relevantRules.categoryRules,
    ]

    const desiredSeries = new Map<
      string,
      {
        key: string
        catalogProductKey: string
        categoryKey: string
        setKey: string
        tcgtrackingCategoryId: number
        tcgtrackingSetId: number
        tcgplayerProductId: number
        name: string
        number?: string
        rarity?: string
        printingKey: string
        printingLabel: string
        skuVariantCode?: string
      }
    >()
    const desiredJoins = new Map<
      string,
      {
        key: string
        ruleId: Id<'pricingTrackingRules'>
        seriesKey: string
        catalogProductKey: string
        setKey: string
        categoryKey: string
      }
    >()

    for (const product of products) {
      const manualRules =
        relevantRules.manualRulesByProductKey.get(product.key) ?? []
      const productRules = [...sharedRules, ...manualRules]
      if (productRules.length === 0) {
        continue
      }

      const printings = getTrackedPrintingDefinitions(product)
      for (const printing of printings) {
        const seriesKey = buildSeriesKey(product.key, printing.printingKey)
        desiredSeries.set(seriesKey, {
          key: seriesKey,
          catalogProductKey: product.key,
          categoryKey: product.categoryKey,
          setKey: product.setKey,
          tcgtrackingCategoryId: product.tcgtrackingCategoryId,
          tcgtrackingSetId: product.tcgtrackingSetId,
          tcgplayerProductId: product.tcgplayerProductId,
          name: product.name,
          number: product.number,
          rarity: product.rarity,
          printingKey: printing.printingKey,
          printingLabel: printing.printingLabel,
          skuVariantCode: printing.skuVariantCode,
        })

        for (const rule of productRules) {
          const joinKey = `${rule._id}:${seriesKey}`
          desiredJoins.set(joinKey, {
            key: joinKey,
            ruleId: rule._id,
            seriesKey,
            catalogProductKey: product.key,
            setKey: product.setKey,
            categoryKey: product.categoryKey,
          })
        }
      }
    }

    const desiredJoinCountBySeries = new Map<string, number>()
    for (const join of desiredJoins.values()) {
      desiredJoinCountBySeries.set(
        join.seriesKey,
        (desiredJoinCountBySeries.get(join.seriesKey) ?? 0) + 1,
      )
    }

    const existingSeriesByKey = new Map(
      existingSeries.map((series) => [series.key, series]),
    )
    const existingJoinsByKey = new Map(
      existingJoins.map((join) => [join.key, join]),
    )

    for (const series of desiredSeries.values()) {
      const activeRuleCount = desiredJoinCountBySeries.get(series.key) ?? 0
      const nextSeries = {
        ...series,
        activeRuleCount,
        active: activeRuleCount > 0,
      }
      const existing = existingSeriesByKey.get(series.key)

      if (existing) {
        if (seriesNeedsPatch(existing, nextSeries)) {
          await ctx.db.patch('pricingTrackedSeries', existing._id, {
            catalogProductKey: nextSeries.catalogProductKey,
            categoryKey: nextSeries.categoryKey,
            setKey: nextSeries.setKey,
            tcgtrackingCategoryId: nextSeries.tcgtrackingCategoryId,
            tcgtrackingSetId: nextSeries.tcgtrackingSetId,
            tcgplayerProductId: nextSeries.tcgplayerProductId,
            name: nextSeries.name,
            number: nextSeries.number,
            rarity: nextSeries.rarity,
            printingKey: nextSeries.printingKey,
            printingLabel: nextSeries.printingLabel,
            skuVariantCode: nextSeries.skuVariantCode,
            activeRuleCount: nextSeries.activeRuleCount,
            active: nextSeries.active,
            updatedAt: now,
          })
        }
        continue
      }

      await ctx.db.insert('pricingTrackedSeries', {
        key: nextSeries.key,
        catalogProductKey: nextSeries.catalogProductKey,
        categoryKey: nextSeries.categoryKey,
        setKey: nextSeries.setKey,
        tcgtrackingCategoryId: nextSeries.tcgtrackingCategoryId,
        tcgtrackingSetId: nextSeries.tcgtrackingSetId,
        tcgplayerProductId: nextSeries.tcgplayerProductId,
        name: nextSeries.name,
        number: nextSeries.number,
        rarity: nextSeries.rarity,
        printingKey: nextSeries.printingKey,
        printingLabel: nextSeries.printingLabel,
        skuVariantCode: nextSeries.skuVariantCode,
        pricingSource: 'unavailable',
        lastResolvedAt: now,
        activeRuleCount: nextSeries.activeRuleCount,
        active: nextSeries.active,
        updatedAt: now,
      })
    }

    for (const existing of existingSeries) {
      if (desiredSeries.has(existing.key)) {
        continue
      }

      if (!existing.active && existing.activeRuleCount === 0) {
        continue
      }

      await ctx.db.patch('pricingTrackedSeries', existing._id, {
        activeRuleCount: 0,
        active: false,
        updatedAt: now,
      })
    }

    for (const join of desiredJoins.values()) {
      const existing = existingJoinsByKey.get(join.key)

      if (existing) {
        if (joinNeedsPatch(existing, join)) {
          await ctx.db.patch('pricingTrackedSeriesRules', existing._id, {
            ruleId: join.ruleId,
            seriesKey: join.seriesKey,
            catalogProductKey: join.catalogProductKey,
            setKey: join.setKey,
            categoryKey: join.categoryKey,
            active: true,
            updatedAt: now,
          })
        }
        continue
      }

      await ctx.db.insert('pricingTrackedSeriesRules', {
        key: join.key,
        ruleId: join.ruleId,
        seriesKey: join.seriesKey,
        catalogProductKey: join.catalogProductKey,
        setKey: join.setKey,
        categoryKey: join.categoryKey,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
    }

    for (const existing of existingJoins) {
      if (desiredJoins.has(existing.key) || !existing.active) {
        continue
      }

      await ctx.db.patch('pricingTrackedSeriesRules', existing._id, {
        active: false,
        updatedAt: now,
      })
    }

    return {
      setKey,
      series: desiredSeries.size,
      joins: desiredJoins.size,
    }
  },
})

export const captureSeriesSnapshotsForSetMutation = internalMutation({
  args: {
    setKey: v.string(),
    capturedAt: v.number(),
  },
  handler: async (ctx, { setKey, capturedAt }) => {
    const [seriesRows, products, skus, existingIssues] = await Promise.all([
      ctx.db
        .query('pricingTrackedSeries')
        .withIndex('by_active_setKey', (q) =>
          q.eq('active', true).eq('setKey', setKey),
        )
        .collect(),
      ctx.db
        .query('catalogProducts')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
      ctx.db
        .query('catalogSkus')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
      ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
    ])

    const productsByKey = new Map(
      products.map((product) => [product.key, product]),
    )
    const skusByProductKey = new Map<string, Array<Doc<'catalogSkus'>>>()
    const existingIssuesByKey = new Map(
      existingIssues.map((issue) => [issue.key, issue]),
    )
    const desiredIssueKeys = new Set<string>()

    for (const sku of skus) {
      const productSkus = skusByProductKey.get(sku.catalogProductKey) ?? []
      productSkus.push(sku)
      skusByProductKey.set(sku.catalogProductKey, productSkus)
    }

    let insertedHistory = 0

    for (const series of seriesRows) {
      const product = productsByKey.get(series.catalogProductKey)
      if (!product) {
        continue
      }

      const snapshot = resolveSeriesSnapshot({
        series,
        product,
        skus: skusByProductKey.get(series.catalogProductKey) ?? [],
        capturedAt,
      })

      for (const issue of snapshot.issues) {
        const key = buildIssueKey(series.key, issue.issueType)
        const existing = existingIssuesByKey.get(key)
        desiredIssueKeys.add(key)

        if (existing) {
          await ctx.db.patch('pricingResolutionIssues', existing._id, {
            details: issue.details,
            lastSeenAt: capturedAt,
            occurrenceCount: existing.occurrenceCount + 1,
            active: true,
          })
        } else {
          await ctx.db.insert('pricingResolutionIssues', {
            key,
            catalogProductKey: series.catalogProductKey,
            seriesKey: series.key,
            setKey: series.setKey,
            categoryKey: series.categoryKey,
            issueType: issue.issueType,
            details: issue.details,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            occurrenceCount: 1,
            active: true,
            ignoredAt: undefined,
          })
        }
      }

      const basePatch = {
        pricingSource: snapshot.pricingSource,
        preferredCatalogSkuKey: snapshot.preferredCatalogSkuKey,
        preferredTcgplayerSku: snapshot.preferredTcgplayerSku,
        currentTcgMarketPriceCents: snapshot.tcgMarketPriceCents,
        currentTcgLowPriceCents: snapshot.tcgLowPriceCents,
        currentTcgHighPriceCents: snapshot.tcgHighPriceCents,
        currentListingCount: snapshot.listingCount,
        currentManapoolPriceCents: snapshot.manapoolPriceCents,
        currentManapoolQuantity: snapshot.manapoolQuantity,
        lastResolvedAt: capturedAt,
        updatedAt: capturedAt,
      }

      if (
        snapshot.pricingSource !== 'unavailable' &&
        snapshot.snapshotFingerprint &&
        snapshot.snapshotFingerprint !== series.lastSnapshotFingerprint
      ) {
        await ctx.db.insert('pricingHistory', {
          seriesKey: series.key,
          catalogProductKey: series.catalogProductKey,
          catalogSkuKey: snapshot.preferredCatalogSkuKey,
          setKey: series.setKey,
          categoryKey: series.categoryKey,
          printingKey: series.printingKey,
          printingLabel: series.printingLabel,
          capturedAt,
          effectiveAt: snapshot.effectiveAt,
          pricingSource: snapshot.pricingSource,
          tcgMarketPriceCents: snapshot.tcgMarketPriceCents,
          tcgLowPriceCents: snapshot.tcgLowPriceCents,
          tcgHighPriceCents: snapshot.tcgHighPriceCents,
          listingCount: snapshot.listingCount,
          manapoolPriceCents: snapshot.manapoolPriceCents,
          manapoolQuantity: snapshot.manapoolQuantity,
          snapshotFingerprint: snapshot.snapshotFingerprint,
          sourcePricingUpdatedAt: snapshot.sourcePricingUpdatedAt,
          sourceSkuPricingUpdatedAt: snapshot.sourceSkuPricingUpdatedAt,
        })
        insertedHistory += 1

        await ctx.db.patch('pricingTrackedSeries', series._id, {
          ...basePatch,
          lastSnapshotFingerprint: snapshot.snapshotFingerprint,
          lastSnapshotAt: capturedAt,
        })
        continue
      }

      await ctx.db.patch('pricingTrackedSeries', series._id, basePatch)
    }

    for (const existing of existingIssues) {
      if (!existing.active || desiredIssueKeys.has(existing.key)) {
        continue
      }

      await ctx.db.patch('pricingResolutionIssues', existing._id, {
        active: false,
        lastSeenAt: capturedAt,
      })
    }

    return {
      setKey,
      series: seriesRows.length,
      insertedHistory,
    }
  },
})

export const upsertSyncIssue = internalMutation({
  args: {
    setKey: v.string(),
    failedAt: v.number(),
    message: v.string(),
    syncStage: v.union(v.literal('catalog'), v.literal('pricing')),
  },
  handler: async (ctx, { setKey, failedAt, message, syncStage }) => {
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const key = buildSyncIssueKey(setKey)
    const existing = await ctx.db
      .query('pricingResolutionIssues')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()

    const details = {
      setName: set.name,
      message,
      syncStage,
      syncStatus: set.syncStatus,
      pricingSyncStatus: set.pricingSyncStatus,
    }

    if (existing) {
      await ctx.db.patch('pricingResolutionIssues', existing._id, {
        details,
        lastSeenAt: failedAt,
        occurrenceCount: existing.occurrenceCount + 1,
        active: true,
      })

      return { key, updated: true }
    }

    await ctx.db.insert('pricingResolutionIssues', {
      key,
      catalogProductKey: '',
      seriesKey: '',
      setKey: set.key,
      categoryKey: set.categoryKey,
      issueType: 'sync_error',
      details,
      firstSeenAt: failedAt,
      lastSeenAt: failedAt,
      occurrenceCount: 1,
      active: true,
      ignoredAt: undefined,
    })

    return { key, updated: false }
  },
})

export const resolveSyncIssue = internalMutation({
  args: {
    setKey: v.string(),
    resolvedAt: v.number(),
  },
  handler: async (ctx, { setKey, resolvedAt }) => {
    const key = buildSyncIssueKey(setKey)
    const existing = await ctx.db
      .query('pricingResolutionIssues')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()

    if (!existing || !existing.active) {
      return { key, resolved: false }
    }

    await ctx.db.patch('pricingResolutionIssues', existing._id, {
      active: false,
      lastSeenAt: resolvedAt,
    })

    return { key, resolved: true }
  },
})

export const backfillSyncIssues = mutation({
  args: {},
  handler: async (ctx) => {
    const erroredSets = await ctx.db.query('catalogSets').collect()
    let insertedOrUpdated = 0

    for (const set of erroredSets) {
      if (set.syncStatus !== 'error' && set.pricingSyncStatus !== 'error') {
        continue
      }

      const key = buildSyncIssueKey(set.key)
      const existing = await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique()

      const details = {
        setName: set.name,
        message: set.lastPricingSyncError ?? set.lastSyncError ?? 'Unknown sync error',
        syncStage:
          set.pricingSyncStatus === 'error' ? 'pricing' : 'catalog',
        syncStatus: set.syncStatus,
        pricingSyncStatus: set.pricingSyncStatus,
      }

      if (existing) {
        await ctx.db.patch('pricingResolutionIssues', existing._id, {
          details,
          lastSeenAt: set.updatedAt,
          active: true,
        })
      } else {
        await ctx.db.insert('pricingResolutionIssues', {
          key,
          catalogProductKey: '',
          seriesKey: '',
          setKey: set.key,
          categoryKey: set.categoryKey,
          issueType: 'sync_error',
          details,
          firstSeenAt: set.updatedAt,
          lastSeenAt: set.updatedAt,
          occurrenceCount: set.consecutiveSyncFailures ?? 1,
          active: true,
          ignoredAt: undefined,
        })
      }

      insertedOrUpdated += 1
    }

    return { insertedOrUpdated }
  },
})

export const setIssueIgnored = mutation({
  args: {
    issueId: v.id('pricingResolutionIssues'),
    ignored: v.boolean(),
  },
  handler: async (ctx, { issueId, ignored }) => {
    const issue = await ctx.db.get('pricingResolutionIssues', issueId)
    if (!issue) {
      throw new Error(`Pricing issue not found: ${issueId}`)
    }

    await ctx.db.patch('pricingResolutionIssues', issueId, {
      ignoredAt: ignored ? Date.now() : undefined,
    })

    return {
      issueId,
      ignored,
    }
  },
})

export const createManualProductRule = mutation({
  args: {
    catalogProductKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { catalogProductKey, label }) => {
    const product = await ctx.db
      .query('catalogProducts')
      .withIndex('by_key', (q) => q.eq('key', catalogProductKey))
      .unique()

    if (!product) {
      throw new Error(`Catalog product not found: ${catalogProductKey}`)
    }

    const now = Date.now()
    const ruleId = await ctx.db.insert('pricingTrackingRules', {
      ruleType: 'manual_product',
      label:
        label?.trim() ||
        buildDefaultRuleLabel({
          ruleType: 'manual_product',
          name: product.name,
        }),
      active: true,
      catalogProductKey,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})

export const createSetRule = mutation({
  args: {
    setKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { setKey, label }) => {
    const set = await ctx.db
      .query('catalogSets')
      .withIndex('by_key', (q) => q.eq('key', setKey))
      .unique()

    if (!set) {
      throw new Error(`Catalog set not found: ${setKey}`)
    }

    const now = Date.now()
    const ruleId = await ctx.db.insert('pricingTrackingRules', {
      ruleType: 'set',
      label:
        label?.trim() ||
        buildDefaultRuleLabel({ ruleType: 'set', name: set.name }),
      active: true,
      setKey,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})

export const createCategoryRule = mutation({
  args: {
    categoryKey: v.string(),
    label: v.optional(v.string()),
    seedExistingSets: v.optional(v.boolean()),
    autoTrackFutureSets: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { categoryKey, label, seedExistingSets, autoTrackFutureSets },
  ) => {
    const category = await ctx.db
      .query('catalogCategories')
      .withIndex('by_key', (q) => q.eq('key', categoryKey))
      .unique()

    if (!category) {
      throw new Error(`Catalog category not found: ${categoryKey}`)
    }

    const now = Date.now()
    const ruleId = await ctx.db.insert('pricingTrackingRules', {
      ruleType: 'category',
      label:
        label?.trim() ||
        buildDefaultRuleLabel({
          ruleType: 'category',
          name: category.displayName,
        }),
      active: true,
      categoryKey,
      seedExistingSets: seedExistingSets ?? true,
      autoTrackFutureSets: autoTrackFutureSets ?? true,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})

export const setRuleActive = mutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
    active: v.boolean(),
  },
  handler: async (ctx, { ruleId, active }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule) {
      throw new Error(`Pricing rule not found: ${ruleId}`)
    }

    if (rule.active === active) {
      return {
        ruleId,
        active,
        scheduled: false,
      }
    }

    await ctx.db.patch('pricingTrackingRules', ruleId, {
      active,
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      active,
      scheduled: true,
    }
  },
})

export const deleteRule = mutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
  },
  handler: async (ctx, { ruleId }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule) {
      throw new Error(`Pricing rule not found: ${ruleId}`)
    }

    await ctx.db.delete('pricingTrackingRules', ruleId)
    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.enqueueRuleAffectedSetSyncs,
      {
        ruleId,
      },
    )

    return {
      ruleId,
      scheduled: true,
    }
  },
})
