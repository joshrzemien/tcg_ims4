import { v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { chunkArray, loadAllPages } from '../../lib/collections'
import {
  buildIssueKey,
  resolveSeriesSnapshot,
} from '../normalizers'
import {
  isActiveUnignoredIssue,
  seriesSnapshotNeedsPatch,
} from '../shared/keys'
import type { Doc } from '../../_generated/dataModel'

const PRICING_SYNC_PAGE_SIZE = 250
const PRICING_SYNC_WRITE_BATCH_SIZE = 100

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
      loadAllPages({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listActiveTrackedSeriesForSetPage,
            { setKey, paginationOpts },
          ),
      }),
      loadAllPages({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listCatalogProductsForSetPage,
            { setKey, paginationOpts },
          ),
      }),
      loadAllPages({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listCatalogSkusForSetPage,
            { setKey, paginationOpts },
          ),
      }),
      loadAllPages({
        pageSize: PRICING_SYNC_PAGE_SIZE,
        loadPage: async (paginationOpts) =>
          await ctx.runQuery(
            internal.pricing.queries.listResolutionIssuesForSetPage,
            { setKey, paginationOpts },
          ),
      }),
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
