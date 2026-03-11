import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { chunkArray, loadAllPages } from '../../lib/collections'
import { getTrackedPrintingDefinitions } from '../../lib/printing'
import {
  buildSeriesKey,
} from '../normalizers'
import {
  buildTrackedSeriesSearchText,
  joinNeedsPatch,
  seriesNeedsPatch,
} from '../shared/keys'
import type { Doc, Id } from '../../_generated/dataModel'

const PRICING_SYNC_PAGE_SIZE = 250
const PRICING_SYNC_WRITE_BATCH_SIZE = 100

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
      loadAllPages<Doc<'catalogProducts'>>({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listCatalogProductsForSetPage,
            { setKey, paginationOpts },
          ),
      }),
      loadAllPages<Doc<'pricingTrackedSeries'>>({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listTrackedSeriesForSetPage,
            { setKey, paginationOpts },
          ),
      }),
      loadAllPages<Doc<'pricingTrackedSeriesRules'>>({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listTrackedSeriesRulesForSetPage,
            { setKey, paginationOpts },
          ),
      }),
    ])

    const productKeySet = new Set(products.map((product) => product.key))
    const manualRulesByProductKey = new Map<string, Array<typeof relevantRules.manualRules[number]>>()
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
