import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction, internalMutation, mutation } from '../_generated/server'
import {
  buildIssueKey,
  buildSeriesKey,
  getTrackedPrintingDefinitions,
  resolveSeriesSnapshot,
} from './normalizers'
import {
  applyDashboardStatsDelta,
  deleteRuleDashboardStats,
  refreshRuleDashboardFields,
  replaceDashboardStats,
  setRuleActiveSeriesCount,
} from './dashboardReadModel'
import { categoryRuleAppliesToSet } from './ruleScope'
import type { Doc, Id } from '../_generated/dataModel'

type TrackingRuleDoc = Doc<'pricingTrackingRules'>
type PricingActionCtx = any
const PRICING_SYNC_PAGE_SIZE = 250
const PRICING_SYNC_WRITE_BATCH_SIZE = 100

function buildSyncIssueKey(setKey: string) {
  return `sync:${setKey}`
}

function buildTrackedSeriesSearchText(params: {
  name: string
  printingLabel: string
  catalogProductKey: string
}) {
  return `${params.name} ${params.printingLabel} ${params.catalogProductKey}`
}

function isActiveUnignoredIssue(issue: {
  active?: boolean
  ignoredAt?: number
}) {
  return issue.active === true && !issue.ignoredAt
}

function chunkArray<T>(items: Array<T>, size: number) {
  const chunks: Array<Array<T>> = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

async function loadAllPages<T>(
  ctx: PricingActionCtx,
  queryRef: any,
  args: Record<string, unknown>,
): Promise<Array<T>> {
  const results: Array<T> = []
  let cursor: string | null = null
  let isDone = false

  while (!isDone) {
    const page: {
      page: Array<T>
      continueCursor: string | null
      isDone: boolean
    } = await ctx.runQuery(queryRef, {
      ...args,
      paginationOpts: {
        cursor,
        numItems: PRICING_SYNC_PAGE_SIZE,
      },
    })

    results.push(...page.page)
    cursor = page.continueCursor
    isDone = page.isDone
  }

  return results
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

function seriesSnapshotNeedsPatch(
  existing: Doc<'pricingTrackedSeries'>,
  desired: {
    pricingSource: Doc<'pricingTrackedSeries'>['pricingSource']
    preferredCatalogSkuKey?: string
    preferredTcgplayerSku?: number
    currentTcgMarketPriceCents?: number
    currentTcgLowPriceCents?: number
    currentTcgHighPriceCents?: number
    currentListingCount?: number
    currentManapoolPriceCents?: number
    currentManapoolQuantity?: number
  },
) {
  return (
    existing.pricingSource !== desired.pricingSource ||
    existing.preferredCatalogSkuKey !== desired.preferredCatalogSkuKey ||
    existing.preferredTcgplayerSku !== desired.preferredTcgplayerSku ||
    existing.currentTcgMarketPriceCents !== desired.currentTcgMarketPriceCents ||
    existing.currentTcgLowPriceCents !== desired.currentTcgLowPriceCents ||
    existing.currentTcgHighPriceCents !== desired.currentTcgHighPriceCents ||
    existing.currentListingCount !== desired.currentListingCount ||
    existing.currentManapoolPriceCents !== desired.currentManapoolPriceCents ||
    existing.currentManapoolQuantity !== desired.currentManapoolQuantity
  )
}

function joinNeedsPatch(
  existing: Doc<'pricingTrackedSeriesRules'>,
  desired: {
    ruleId: Id<'pricingTrackingRules'>
    seriesKey: string
    setKey: string
  },
) {
  return (
    existing.ruleId !== desired.ruleId ||
    existing.seriesKey !== desired.seriesKey ||
    existing.setKey !== desired.setKey ||
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
      if (rule.ruleType === 'manual_product') {
        if (rule.setKey) {
          setKeys.add(rule.setKey)
        } else if (rule.catalogProductKey) {
          const product = await ctx.db
            .query('catalogProducts')
            .withIndex('by_key', (q: any) =>
              q.eq('key', rule.catalogProductKey!),
            )
            .unique()

          if (product) {
            setKeys.add(product.setKey)
          }
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

export const applyTrackedSeriesCoverageBatch = internalMutation({
  args: {
    inserts: v.array(v.any()),
    patches: v.array(v.any()),
  },
  handler: async (ctx, { inserts, patches }) => {
    for (const insert of inserts) {
      await ctx.db.insert('pricingTrackedSeries', insert)
    }

    for (const patch of patches) {
      await ctx.db.patch('pricingTrackedSeries', patch.id, patch.value)
    }
  },
})

export const applyTrackedSeriesRuleCoverageBatch = internalMutation({
  args: {
    inserts: v.array(v.any()),
    patches: v.array(v.any()),
  },
  handler: async (ctx, { inserts, patches }) => {
    for (const insert of inserts) {
      await ctx.db.insert('pricingTrackedSeriesRules', insert)
    }

    for (const patch of patches) {
      await ctx.db.patch('pricingTrackedSeriesRules', patch.id, patch.value)
    }
  },
})

export const applyRuleActiveSeriesCountsBatch = internalMutation({
  args: {
    counts: v.array(v.any()),
    updatedAt: v.number(),
  },
  handler: async (ctx, { counts, updatedAt }) => {
    for (const count of counts) {
      await setRuleActiveSeriesCount(
        ctx,
        count.ruleId,
        count.activeSeriesCount,
        updatedAt,
      )
    }
  },
})

export const applyDashboardStatsDeltaMutation = internalMutation({
  args: {
    delta: v.any(),
    updatedAt: v.number(),
  },
  handler: async (ctx, { delta, updatedAt }) => {
    await applyDashboardStatsDelta(ctx, delta, updatedAt)
  },
})

export const applySeriesSnapshotBatch = internalMutation({
  args: {
    historyInserts: v.array(v.any()),
    seriesPatches: v.array(v.any()),
    issueInserts: v.array(v.any()),
    issuePatches: v.array(v.any()),
  },
  handler: async (ctx, { historyInserts, seriesPatches, issueInserts, issuePatches }) => {
    for (const insert of historyInserts) {
      await ctx.db.insert('pricingHistory', insert)
    }

    for (const patch of seriesPatches) {
      await ctx.db.patch('pricingTrackedSeries', patch.id, patch.value)
    }

    for (const insert of issueInserts) {
      await ctx.db.insert('pricingResolutionIssues', insert)
    }

    for (const patch of issuePatches) {
      await ctx.db.patch('pricingResolutionIssues', patch.id, patch.value)
    }
  },
})

export const deactivateResolutionIssuesBatch = internalMutation({
  args: {
    issuePatches: v.array(v.any()),
  },
  handler: async (ctx, { issuePatches }) => {
    for (const patch of issuePatches) {
      await ctx.db.patch('pricingResolutionIssues', patch.id, patch.value)
    }
  },
})

export const refreshTrackedCoverageForSetMutation = internalAction({
  args: {
    setKey: v.string(),
  },
  handler: async (ctx, { setKey }) => {
    const now = Date.now()
    const relevantRules = await ctx.runQuery(
      internal.pricing.queries.getRelevantRulesForSet,
      { setKey },
    )

    if (!relevantRules.set) {
      return { setKey, series: 0, joins: 0 }
    }

    const [products, existingSeries, existingJoins] = await Promise.all([
      loadAllPages<Doc<'catalogProducts'>>(
        ctx,
        internal.pricing.queries.listCatalogProductsForSetPage,
        { setKey },
      ),
      loadAllPages<Doc<'pricingTrackedSeries'>>(
        ctx,
        internal.pricing.queries.listTrackedSeriesForSetPage,
        { setKey },
      ),
      loadAllPages<Doc<'pricingTrackedSeriesRules'>>(
        ctx,
        internal.pricing.queries.listTrackedSeriesRulesForSetPage,
        { setKey },
      ),
    ])

    const productKeySet = new Set(products.map((product) => product.key))
    const manualRulesByProductKey = new Map<string, Array<TrackingRuleDoc>>()
    const sharedRules = [...relevantRules.setRules, ...relevantRules.categoryRules]

    for (const rule of relevantRules.manualRules) {
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

    const desiredSeries = new Map<string, any>()
    const desiredJoins = new Map<string, any>()

    for (const product of products) {
      const manualRules = manualRulesByProductKey.get(product.key) ?? []
      const productRules = [...sharedRules, ...manualRules]
      if (productRules.length === 0) {
        continue
      }

      for (const printing of getTrackedPrintingDefinitions(product)) {
        const seriesKey = buildSeriesKey(product.key, printing.printingKey)
        desiredSeries.set(seriesKey, {
          key: seriesKey,
          catalogProductKey: product.key,
          categoryKey: product.categoryKey,
          setKey: product.setKey,
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
            setKey: product.setKey,
          })
        }
      }
    }

    const desiredJoinCountBySeries = new Map<string, number>()
    const desiredActiveJoinCountByRule = new Map<Id<'pricingTrackingRules'>, number>()
    for (const join of desiredJoins.values()) {
      desiredJoinCountBySeries.set(
        join.seriesKey,
        (desiredJoinCountBySeries.get(join.seriesKey) ?? 0) + 1,
      )
      desiredActiveJoinCountByRule.set(
        join.ruleId,
        (desiredActiveJoinCountByRule.get(join.ruleId) ?? 0) + 1,
      )
    }

    const existingSeriesByKey = new Map(
      existingSeries.map((series) => [series.key, series]),
    )
    const existingJoinsByKey = new Map(
      existingJoins.map((join) => [join.key, join]),
    )
    const seriesInserts: Array<any> = []
    const seriesPatches: Array<any> = []
    const joinInserts: Array<any> = []
    const joinPatches: Array<any> = []
    let insertedSeriesCount = 0
    let activatedSeriesCount = 0
    let deactivatedSeriesCount = 0

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
          seriesPatches.push({
            id: existing._id,
            value: {
              catalogProductKey: nextSeries.catalogProductKey,
              categoryKey: nextSeries.categoryKey,
              setKey: nextSeries.setKey,
              searchText: buildTrackedSeriesSearchText(nextSeries),
              name: nextSeries.name,
              number: nextSeries.number,
              rarity: nextSeries.rarity,
              printingKey: nextSeries.printingKey,
              printingLabel: nextSeries.printingLabel,
              skuVariantCode: nextSeries.skuVariantCode,
              activeRuleCount: nextSeries.activeRuleCount,
              active: nextSeries.active,
              updatedAt: now,
            },
          })
        }
        continue
      }

      seriesInserts.push({
        key: nextSeries.key,
        catalogProductKey: nextSeries.catalogProductKey,
        categoryKey: nextSeries.categoryKey,
        setKey: nextSeries.setKey,
        searchText: buildTrackedSeriesSearchText(nextSeries),
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
      insertedSeriesCount += 1
    }

    for (const existing of existingSeries) {
      if (desiredSeries.has(existing.key)) {
        const nextActive = (desiredJoinCountBySeries.get(existing.key) ?? 0) > 0
        if (!existing.active && nextActive) {
          activatedSeriesCount += 1
        }
        continue
      }

      if (!existing.active && existing.activeRuleCount === 0) {
        continue
      }

      seriesPatches.push({
        id: existing._id,
        value: {
          activeRuleCount: 0,
          active: false,
          updatedAt: now,
        },
      })
      if (existing.active) {
        deactivatedSeriesCount += 1
      }
    }

    for (const join of desiredJoins.values()) {
      const existing = existingJoinsByKey.get(join.key)

      if (existing) {
        if (joinNeedsPatch(existing, join)) {
          joinPatches.push({
            id: existing._id,
            value: {
              ruleId: join.ruleId,
              seriesKey: join.seriesKey,
              setKey: join.setKey,
              active: true,
              updatedAt: now,
            },
          })
        }
        continue
      }

      joinInserts.push({
        key: join.key,
        ruleId: join.ruleId,
        seriesKey: join.seriesKey,
        setKey: join.setKey,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
    }

    for (const existing of existingJoins) {
      if (desiredJoins.has(existing.key) || !existing.active) {
        continue
      }

      joinPatches.push({
        id: existing._id,
        value: {
          active: false,
          updatedAt: now,
        },
      })
    }

    for (const inserts of chunkArray(
      seriesInserts,
      PRICING_SYNC_WRITE_BATCH_SIZE,
    )) {
      await ctx.runMutation(
        internal.pricing.mutations.applyTrackedSeriesCoverageBatch,
        { inserts, patches: [] },
      )
    }

    for (const patches of chunkArray(
      seriesPatches,
      PRICING_SYNC_WRITE_BATCH_SIZE,
    )) {
      await ctx.runMutation(
        internal.pricing.mutations.applyTrackedSeriesCoverageBatch,
        { inserts: [], patches },
      )
    }

    for (const inserts of chunkArray(
      joinInserts,
      PRICING_SYNC_WRITE_BATCH_SIZE,
    )) {
      await ctx.runMutation(
        internal.pricing.mutations.applyTrackedSeriesRuleCoverageBatch,
        { inserts, patches: [] },
      )
    }

    for (const patches of chunkArray(
      joinPatches,
      PRICING_SYNC_WRITE_BATCH_SIZE,
    )) {
      await ctx.runMutation(
        internal.pricing.mutations.applyTrackedSeriesRuleCoverageBatch,
        { inserts: [], patches },
      )
    }

    const affectedRuleCounts = [...new Set([
      ...existingJoins.map((join) => join.ruleId),
      ...desiredActiveJoinCountByRule.keys(),
    ])].map((ruleId) => ({
      ruleId,
      activeSeriesCount: desiredActiveJoinCountByRule.get(ruleId) ?? 0,
    }))

    for (const counts of chunkArray(
      affectedRuleCounts,
      PRICING_SYNC_WRITE_BATCH_SIZE,
    )) {
      await ctx.runMutation(
        internal.pricing.mutations.applyRuleActiveSeriesCountsBatch,
        {
          counts,
          updatedAt: now,
        },
      )
    }

    const totalActiveTrackedSeriesDelta =
      insertedSeriesCount + activatedSeriesCount - deactivatedSeriesCount
    if (insertedSeriesCount !== 0 || totalActiveTrackedSeriesDelta !== 0) {
      await ctx.runMutation(
        internal.pricing.mutations.applyDashboardStatsDeltaMutation,
        {
          delta: {
            totalTrackedSeries: insertedSeriesCount,
            totalActiveTrackedSeries: totalActiveTrackedSeriesDelta,
          },
          updatedAt: now,
        },
      )
    }

    await ctx.runMutation(internal.catalog.mutations.recordSetPricingScopeState, {
      setKey,
      inRuleScope:
        relevantRules.setRules.length > 0 ||
        relevantRules.categoryRules.length > 0 ||
        relevantRules.manualRules.length > 0,
      activeTrackedSeriesCount: [...desiredJoinCountBySeries.values()].filter(
        (count) => count > 0,
      ).length,
      updatedAt: now,
    })

    return {
      setKey,
      series: desiredSeries.size,
      joins: desiredJoins.size,
    }
  },
})

export const captureSeriesSnapshotsForSetMutation = internalAction({
  args: {
    setKey: v.string(),
    capturedAt: v.number(),
  },
  handler: async (
    ctx,
    { setKey, capturedAt },
  ): Promise<{
    setKey: string
    series: number
    insertedHistory: number
  }> => {
    const [seriesRows, products, skus, existingIssues]: [
      Array<Doc<'pricingTrackedSeries'>>,
      Array<Doc<'catalogProducts'>>,
      Array<Doc<'catalogSkus'>>,
      Array<Doc<'pricingResolutionIssues'>>,
    ] = await Promise.all([
      loadAllPages<Doc<'pricingTrackedSeries'>>(
        ctx,
        internal.pricing.queries.listActiveTrackedSeriesForSetPage,
        { setKey },
      ),
      loadAllPages<Doc<'catalogProducts'>>(
        ctx,
        internal.pricing.queries.listCatalogProductsForSetPage,
        { setKey },
      ),
      loadAllPages<Doc<'catalogSkus'>>(
        ctx,
        internal.pricing.queries.listCatalogSkusForSetPage,
        { setKey },
      ),
      loadAllPages<Doc<'pricingResolutionIssues'>>(
        ctx,
        internal.pricing.queries.listResolutionIssuesForSetPage,
        { setKey },
      ),
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

    const historyInserts: Array<any> = []
    const seriesPatches: Array<any> = []
    const issueInserts: Array<any> = []
    const issuePatches: Array<any> = []
    const issueDeactivatePatches: Array<any> = []
    let insertedHistory = 0
    let totalIssuesDelta = 0
    let totalActiveIssuesDelta = 0

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
          const wasActiveUnignored = isActiveUnignoredIssue(existing)
          issuePatches.push({
            id: existing._id,
            value: {
              details: issue.details,
              lastSeenAt: capturedAt,
              occurrenceCount: existing.occurrenceCount + 1,
              active: true,
            },
          })
          if (!wasActiveUnignored && !existing.ignoredAt) {
            totalActiveIssuesDelta += 1
          }
        } else {
          issueInserts.push({
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
            isIgnored: false,
            ignoredAt: undefined,
          })
          totalIssuesDelta += 1
          totalActiveIssuesDelta += 1
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
      }
      const snapshotChanged = seriesSnapshotNeedsPatch(series, basePatch)
      const historyChanged =
        snapshot.pricingSource !== 'unavailable' &&
        snapshot.snapshotFingerprint &&
        snapshot.snapshotFingerprint !== series.lastSnapshotFingerprint

      if (snapshot.pricingSource !== 'unavailable' && historyChanged) {
        historyInserts.push({
          seriesKey: series.key,
          capturedAt,
          effectiveAt: snapshot.effectiveAt,
          pricingSource: snapshot.pricingSource,
          tcgMarketPriceCents: snapshot.tcgMarketPriceCents,
          tcgLowPriceCents: snapshot.tcgLowPriceCents,
          tcgHighPriceCents: snapshot.tcgHighPriceCents,
          listingCount: snapshot.listingCount,
          manapoolPriceCents: snapshot.manapoolPriceCents,
          manapoolQuantity: snapshot.manapoolQuantity,
        })
        seriesPatches.push({
          id: series._id,
          value: {
            ...basePatch,
            lastSnapshotFingerprint: snapshot.snapshotFingerprint,
            lastSnapshotAt: capturedAt,
            updatedAt: capturedAt,
          },
        })
        insertedHistory += 1
        continue
      }

      if (snapshotChanged) {
        seriesPatches.push({
          id: series._id,
          value: {
            ...basePatch,
            updatedAt: capturedAt,
          },
        })
      }
    }

    for (const existing of existingIssues) {
      if (!existing.active || desiredIssueKeys.has(existing.key)) {
        continue
      }

      issueDeactivatePatches.push({
        id: existing._id,
        value: {
          active: false,
          lastSeenAt: capturedAt,
        },
      })
      if (isActiveUnignoredIssue(existing)) {
        totalActiveIssuesDelta -= 1
      }
    }

    const batchCount = Math.max(
      historyInserts.length,
      seriesPatches.length,
      issueInserts.length,
      issuePatches.length,
    )
    const batchIterations = Math.max(
      1,
      Math.ceil(batchCount / PRICING_SYNC_WRITE_BATCH_SIZE),
    )

    for (let index = 0; index < batchIterations; index += 1) {
      const start = index * PRICING_SYNC_WRITE_BATCH_SIZE
      await ctx.runMutation(internal.pricing.mutations.applySeriesSnapshotBatch, {
        historyInserts: historyInserts.slice(
          start,
          start + PRICING_SYNC_WRITE_BATCH_SIZE,
        ),
        seriesPatches: seriesPatches.slice(
          start,
          start + PRICING_SYNC_WRITE_BATCH_SIZE,
        ),
        issueInserts: issueInserts.slice(
          start,
          start + PRICING_SYNC_WRITE_BATCH_SIZE,
        ),
        issuePatches: issuePatches.slice(
          start,
          start + PRICING_SYNC_WRITE_BATCH_SIZE,
        ),
      })
    }

    for (const issuePatchesBatch of chunkArray(
      issueDeactivatePatches,
      PRICING_SYNC_WRITE_BATCH_SIZE,
    )) {
      await ctx.runMutation(
        internal.pricing.mutations.deactivateResolutionIssuesBatch,
        {
          issuePatches: issuePatchesBatch,
        },
      )
    }

    if (totalIssuesDelta !== 0 || totalActiveIssuesDelta !== 0) {
      await ctx.runMutation(
        internal.pricing.mutations.applyDashboardStatsDeltaMutation,
        {
          delta: {
            totalIssues: totalIssuesDelta,
            totalActiveIssues: totalActiveIssuesDelta,
          },
          updatedAt: capturedAt,
        },
      )
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
      const wasActiveUnignored = isActiveUnignoredIssue(existing)
      await ctx.db.patch('pricingResolutionIssues', existing._id, {
        details,
        lastSeenAt: failedAt,
        occurrenceCount: existing.occurrenceCount + 1,
        active: true,
      })

      if (!wasActiveUnignored && !existing.ignoredAt) {
        await applyDashboardStatsDelta(
          ctx,
          {
            totalActiveIssues: 1,
          },
          failedAt,
        )
      }

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
      isIgnored: false,
      ignoredAt: undefined,
    })
    await applyDashboardStatsDelta(
      ctx,
      {
        totalIssues: 1,
        totalActiveIssues: 1,
      },
      failedAt,
    )

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
    if (isActiveUnignoredIssue(existing)) {
      await applyDashboardStatsDelta(
        ctx,
        {
          totalActiveIssues: -1,
        },
        resolvedAt,
      )
    }

    return { key, resolved: true }
  },
})

export const backfillSyncIssues = mutation({
  args: {},
  handler: async (ctx) => {
    const erroredSets = await ctx.db.query('catalogSets').collect()
    let insertedOrUpdated = 0
    let totalIssuesDelta = 0
    let totalActiveIssuesDelta = 0

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
        const wasActiveUnignored = isActiveUnignoredIssue(existing)
        await ctx.db.patch('pricingResolutionIssues', existing._id, {
          details,
          lastSeenAt: set.updatedAt,
          active: true,
        })
        if (!wasActiveUnignored && !existing.ignoredAt) {
          totalActiveIssuesDelta += 1
        }
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
          isIgnored: false,
          ignoredAt: undefined,
        })
        totalIssuesDelta += 1
        totalActiveIssuesDelta += 1
      }

      insertedOrUpdated += 1
    }

    if (totalIssuesDelta !== 0 || totalActiveIssuesDelta !== 0) {
      await applyDashboardStatsDelta(ctx, {
        totalIssues: totalIssuesDelta,
        totalActiveIssues: totalActiveIssuesDelta,
      })
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

    const updatedAt = Date.now()
    await ctx.db.patch('pricingResolutionIssues', issueId, {
      isIgnored: ignored,
      ignoredAt: ignored ? updatedAt : undefined,
    })
    if (issue.active) {
      if (ignored && !issue.ignoredAt) {
        await applyDashboardStatsDelta(
          ctx,
          {
            totalActiveIssues: -1,
          },
          updatedAt,
        )
      } else if (!ignored && issue.ignoredAt) {
        await applyDashboardStatsDelta(
          ctx,
          {
            totalActiveIssues: 1,
          },
          updatedAt,
        )
      }
    }

    return {
      issueId,
      ignored,
    }
  },
})

export const replaceDashboardStatsSnapshot = internalMutation({
  args: {
    stats: v.object({
      totalTrackedSeries: v.number(),
      totalActiveTrackedSeries: v.number(),
      totalRules: v.number(),
      totalActiveRules: v.number(),
      totalIssues: v.number(),
      totalActiveIssues: v.number(),
    }),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { stats, updatedAt }) => {
    await replaceDashboardStats(ctx, stats, updatedAt ?? Date.now())

    return {
      replaced: true,
    }
  },
})

export const rebuildRuleDashboardEntry = internalMutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
    activeSeriesCount: v.number(),
  },
  handler: async (ctx, { ruleId, activeSeriesCount }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule) {
      await deleteRuleDashboardStats(ctx, ruleId)
      return {
        ruleId,
        found: false,
      }
    }

    await setRuleActiveSeriesCount(ctx, ruleId, activeSeriesCount)
    await refreshRuleDashboardFields(ctx, ruleId)

    return {
      ruleId,
      found: true,
      activeSeriesCount,
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
      categoryKey: product.categoryKey,
      setKey: product.setKey,
      catalogProductKey,
      createdAt: now,
      updatedAt: now,
    })

    await refreshRuleDashboardFields(ctx, ruleId)
    await setRuleActiveSeriesCount(ctx, ruleId, 0, now)
    await applyDashboardStatsDelta(
      ctx,
      {
        totalRules: 1,
        totalActiveRules: 1,
      },
      now,
    )

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

    await refreshRuleDashboardFields(ctx, ruleId)
    await setRuleActiveSeriesCount(ctx, ruleId, 0, now)
    await applyDashboardStatsDelta(
      ctx,
      {
        totalRules: 1,
        totalActiveRules: 1,
      },
      now,
    )

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

    await refreshRuleDashboardFields(ctx, ruleId)
    await setRuleActiveSeriesCount(ctx, ruleId, 0, now)
    await applyDashboardStatsDelta(
      ctx,
      {
        totalRules: 1,
        totalActiveRules: 1,
      },
      now,
    )

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

    const updatedAt = Date.now()
    await ctx.db.patch('pricingTrackingRules', ruleId, {
      active,
      updatedAt,
    })
    await applyDashboardStatsDelta(
      ctx,
      {
        totalActiveRules: active ? 1 : -1,
      },
      updatedAt,
    )

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
    await deleteRuleDashboardStats(ctx, ruleId)
    await applyDashboardStatsDelta(ctx, {
      totalRules: -1,
      totalActiveRules: rule.active ? -1 : 0,
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
