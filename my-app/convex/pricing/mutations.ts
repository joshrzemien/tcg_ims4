import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation, mutation } from '../_generated/server'
import {
  buildIssueKey,
  buildSeriesKey,
  getTrackedPrintingDefinitions,
  resolveSeriesSnapshot,
} from './normalizers'
import type { Doc, Id } from '../_generated/dataModel'

const DEACTIVATE_RULE_BATCH_SIZE = 200

type TrackingRuleDoc = Doc<'pricingTrackingRules'>
type CatalogSetDoc = Doc<'catalogSets'>
type PricingMutationCtx = any

function categoryRuleAppliesToSet(
  rule: TrackingRuleDoc,
  set: CatalogSetDoc,
) {
  if (rule.ruleType !== 'category' || rule.categoryKey !== set.categoryKey) {
    return false
  }

  const setExistedBeforeRule = set._creationTime < rule.createdAt
  if (setExistedBeforeRule) {
    return rule.seedExistingSets !== false
  }

  return rule.autoTrackFutureSets !== false
}

function ruleAppliesToProduct(
  rule: TrackingRuleDoc,
  set: CatalogSetDoc,
  product: Doc<'catalogProducts'>,
) {
  if (!rule.active) {
    return false
  }

  if (rule.ruleType === 'manual_product') {
    return rule.catalogProductKey === product.key
  }

  if (rule.ruleType === 'set') {
    return rule.setKey === set.key
  }

  return categoryRuleAppliesToSet(rule, set)
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

async function recomputeSeriesActivity(
  ctx: PricingMutationCtx,
  seriesKey: string,
  now: number,
) {
  const series = await ctx.db
    .query('pricingTrackedSeries')
    .withIndex('by_key', (q: any) => q.eq('key', seriesKey))
    .unique()

  if (!series) {
    return
  }

  const activeJoins = await ctx.db
    .query('pricingTrackedSeriesRules')
    .withIndex('by_seriesKey_active', (q: any) =>
      q.eq('seriesKey', seriesKey).eq('active', true),
    )
    .collect()

  await ctx.db.patch('pricingTrackedSeries', series._id, {
    activeRuleCount: activeJoins.length,
    active: activeJoins.length > 0,
    updatedAt: now,
  })
}

async function upsertTrackedSeries(
  ctx: PricingMutationCtx,
  params: {
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
    now: number
  },
) {
  const existing = await ctx.db
    .query('pricingTrackedSeries')
    .withIndex('by_key', (q: any) => q.eq('key', params.key))
    .unique()

  if (existing) {
    await ctx.db.patch('pricingTrackedSeries', existing._id, {
      catalogProductKey: params.catalogProductKey,
      categoryKey: params.categoryKey,
      setKey: params.setKey,
      tcgtrackingCategoryId: params.tcgtrackingCategoryId,
      tcgtrackingSetId: params.tcgtrackingSetId,
      tcgplayerProductId: params.tcgplayerProductId,
      name: params.name,
      number: params.number,
      rarity: params.rarity,
      printingKey: params.printingKey,
      printingLabel: params.printingLabel,
      skuVariantCode: params.skuVariantCode,
      updatedAt: params.now,
    })
    return existing
  }

  const id = await ctx.db.insert('pricingTrackedSeries', {
    key: params.key,
    catalogProductKey: params.catalogProductKey,
    categoryKey: params.categoryKey,
    setKey: params.setKey,
    tcgtrackingCategoryId: params.tcgtrackingCategoryId,
    tcgtrackingSetId: params.tcgtrackingSetId,
    tcgplayerProductId: params.tcgplayerProductId,
    name: params.name,
    number: params.number,
    rarity: params.rarity,
    printingKey: params.printingKey,
    printingLabel: params.printingLabel,
    skuVariantCode: params.skuVariantCode,
    pricingSource: 'unavailable',
    lastResolvedAt: params.now,
    activeRuleCount: 0,
    active: false,
    updatedAt: params.now,
  })

  return await ctx.db.get('pricingTrackedSeries', id)
}

async function syncSeriesIssues(
  ctx: PricingMutationCtx,
  params: {
    series: Doc<'pricingTrackedSeries'>
    issues: Array<{
      issueType:
        | 'ambiguous_nm_en_sku'
        | 'unmapped_printing'
        | 'missing_product_price'
        | 'missing_manapool_match'
      details: Record<string, unknown>
    }>
    now: number
  },
) {
  const existingIssues = await ctx.db
    .query('pricingResolutionIssues')
    .withIndex('by_seriesKey', (q: any) => q.eq('seriesKey', params.series.key))
    .collect()

  const desiredKeys = new Set<string>()

  for (const issue of params.issues) {
    const key = buildIssueKey(params.series.key, issue.issueType)
    desiredKeys.add(key)
    const existing = existingIssues.find(
      (entry: Doc<'pricingResolutionIssues'>) => entry.key === key,
    )

    if (existing) {
      await ctx.db.patch('pricingResolutionIssues', existing._id, {
        details: issue.details,
        lastSeenAt: params.now,
        occurrenceCount: existing.occurrenceCount + 1,
        active: true,
      })
      continue
    }

    await ctx.db.insert('pricingResolutionIssues', {
      key,
      catalogProductKey: params.series.catalogProductKey,
      seriesKey: params.series.key,
      setKey: params.series.setKey,
      categoryKey: params.series.categoryKey,
      issueType: issue.issueType,
      details: issue.details,
      firstSeenAt: params.now,
      lastSeenAt: params.now,
      occurrenceCount: 1,
      active: true,
    })
  }

  for (const existing of existingIssues) {
    if (!existing.active || desiredKeys.has(existing.key)) {
      continue
    }

    await ctx.db.patch('pricingResolutionIssues', existing._id, {
      active: false,
      lastSeenAt: params.now,
    })
  }
}

export const refreshRuleCoverage = internalMutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
  },
  handler: async (ctx, { ruleId }) => {
    const rule = await ctx.db.get('pricingTrackingRules', ruleId)
    if (!rule || !rule.active) {
      return { scheduled: 0 }
    }

    const setKeys = new Set<string>()

    if (rule.ruleType === 'manual_product' && rule.catalogProductKey) {
      const product = await ctx.db
        .query('catalogProducts')
        .withIndex('by_key', (q) => q.eq('key', rule.catalogProductKey!))
        .unique()

      if (product) {
        setKeys.add(product.setKey)
      }
    } else if (rule.ruleType === 'set' && rule.setKey) {
      setKeys.add(rule.setKey)
    } else if (rule.ruleType === 'category' && rule.categoryKey) {
      const sets = await ctx.db
        .query('catalogSets')
        .withIndex('by_categoryKey', (q) => q.eq('categoryKey', rule.categoryKey!))
        .collect()

      for (const set of sets) {
        if (categoryRuleAppliesToSet(rule, set)) {
          setKeys.add(set.key)
        }
      }
    }

    const syncStartedAt = Date.now()

    for (const setKey of setKeys) {
      await ctx.scheduler.runAfter(0, internal.pricing.sync.processSetAfterCatalogSync, {
        setKey,
        syncStartedAt,
      })
    }

    return { scheduled: setKeys.size }
  },
})

export const deactivateRuleCoverageBatch = internalMutation({
  args: {
    ruleId: v.id('pricingTrackingRules'),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { ruleId, cursor }) => {
    const now = Date.now()
    const page = await ctx.db
      .query('pricingTrackedSeriesRules')
      .withIndex('by_ruleId', (q) => q.eq('ruleId', ruleId))
      .paginate({
        cursor,
        numItems: DEACTIVATE_RULE_BATCH_SIZE,
      })

    const touchedSeriesKeys = new Set<string>()

    for (const join of page.page) {
      touchedSeriesKeys.add(join.seriesKey)

      if (!join.active) {
        continue
      }

      await ctx.db.patch('pricingTrackedSeriesRules', join._id, {
        active: false,
        updatedAt: now,
      })
    }

    for (const seriesKey of touchedSeriesKeys) {
      await recomputeSeriesActivity(ctx, seriesKey, now)
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.pricing.mutations.deactivateRuleCoverageBatch,
        {
          ruleId,
          cursor: page.continueCursor,
        },
      )
    }

    return {
      processed: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
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

    const [products, activeRules, existingJoins] = await Promise.all([
      ctx.db.query('catalogProducts').withIndex('by_setKey', (q) => q.eq('setKey', setKey)).collect(),
      ctx.db
        .query('pricingTrackingRules')
        .withIndex('by_active', (q) => q.eq('active', true))
        .collect(),
      ctx.db
        .query('pricingTrackedSeriesRules')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
    ])

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
      const productRules = activeRules.filter((rule) =>
        ruleAppliesToProduct(rule, set, product),
      )
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

    const existingJoinsByKey = new Map(existingJoins.map((join) => [join.key, join]))
    const touchedSeriesKeys = new Set<string>()

    for (const series of desiredSeries.values()) {
      await upsertTrackedSeries(ctx, { ...series, now })
      touchedSeriesKeys.add(series.key)
    }

    for (const join of desiredJoins.values()) {
      const existing = existingJoinsByKey.get(join.key)
      if (existing) {
        touchedSeriesKeys.add(existing.seriesKey)
        if (
          !existing.active ||
          existing.catalogProductKey !== join.catalogProductKey ||
          existing.categoryKey !== join.categoryKey
        ) {
          await ctx.db.patch('pricingTrackedSeriesRules', existing._id, {
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
      touchedSeriesKeys.add(join.seriesKey)
    }

    for (const join of existingJoins) {
      if (desiredJoins.has(join.key) || !join.active) {
        continue
      }

      await ctx.db.patch('pricingTrackedSeriesRules', join._id, {
        active: false,
        updatedAt: now,
      })
      touchedSeriesKeys.add(join.seriesKey)
    }

    for (const seriesKey of touchedSeriesKeys) {
      await recomputeSeriesActivity(ctx, seriesKey, now)
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
    const [seriesRows, products, skus] = await Promise.all([
      ctx.db
        .query('pricingTrackedSeries')
        .withIndex('by_active_setKey', (q) => q.eq('active', true).eq('setKey', setKey))
        .collect(),
      ctx.db
        .query('catalogProducts')
        .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
        .collect(),
      ctx.db.query('catalogSkus').withIndex('by_setKey', (q) => q.eq('setKey', setKey)).collect(),
    ])

    const productsByKey = new Map(products.map((product) => [product.key, product]))
    const skusByProductKey = new Map<string, Array<Doc<'catalogSkus'>>>()

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

      await syncSeriesIssues(ctx, {
        series,
        issues: snapshot.issues,
        now: capturedAt,
      })

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

    return {
      setKey,
      series: seriesRows.length,
      insertedHistory,
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
      label: label?.trim() || buildDefaultRuleLabel({
        ruleType: 'manual_product',
        name: product.name,
      }),
      active: true,
      catalogProductKey,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(0, internal.pricing.mutations.refreshRuleCoverage, {
      ruleId,
    })

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
      label: label?.trim() || buildDefaultRuleLabel({ ruleType: 'set', name: set.name }),
      active: true,
      setKey,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(0, internal.pricing.mutations.refreshRuleCoverage, {
      ruleId,
    })

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
  handler: async (ctx, { categoryKey, label, seedExistingSets, autoTrackFutureSets }) => {
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

    await ctx.scheduler.runAfter(0, internal.pricing.mutations.refreshRuleCoverage, {
      ruleId,
    })

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

    if (active) {
      await ctx.scheduler.runAfter(0, internal.pricing.mutations.refreshRuleCoverage, {
        ruleId,
      })
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.pricing.mutations.deactivateRuleCoverageBatch,
        {
          ruleId,
          cursor: null,
        },
      )
    }

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

    await ctx.scheduler.runAfter(
      0,
      internal.pricing.mutations.deactivateRuleCoverageBatch,
      {
        ruleId,
        cursor: null,
      },
    )
    await ctx.db.delete('pricingTrackingRules', ruleId)

    return {
      ruleId,
      scheduled: true,
    }
  },
})
