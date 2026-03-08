import { filterEligibleSkus } from '../catalog/syncPolicy'
import type { Doc } from '../_generated/dataModel'

export type PricingResolutionIssueType =
  | 'ambiguous_nm_en_sku'
  | 'unmapped_printing'
  | 'missing_product_price'
  | 'missing_manapool_match'

export type PricingSeriesSource = 'sku' | 'product_fallback' | 'unavailable'

export type PricingResolutionIssue = {
  issueType: PricingResolutionIssueType
  details: Record<string, unknown>
}

export type TrackedPrintingDefinition = {
  printingKey: string
  printingLabel: string
  skuVariantCode?: string
  tcgMarketPriceCents?: number
  tcgLowPriceCents?: number
  tcgHighPriceCents?: number
  manapoolPriceCents?: number
  manapoolQuantity?: number
}

export type ResolvedSeriesSnapshot = {
  pricingSource: PricingSeriesSource
  preferredCatalogSkuKey?: string
  preferredTcgplayerSku?: number
  tcgMarketPriceCents?: number
  tcgLowPriceCents?: number
  tcgHighPriceCents?: number
  listingCount?: number
  manapoolPriceCents?: number
  manapoolQuantity?: number
  effectiveAt: number
  sourcePricingUpdatedAt?: number
  sourceSkuPricingUpdatedAt?: number
  snapshotFingerprint?: string
  issues: Array<PricingResolutionIssue>
}

const DEFAULT_SKU_VARIANT_CODE_BY_PRINTING_KEY: Record<string, string> = {
  normal: 'N',
  foil: 'F',
}

const SKU_VARIANT_CODE_BY_CATEGORY_ID: Partial<
  Record<number, Partial<Record<string, string>>>
> = {
  3: {
    normal: 'N',
    holofoil: 'H',
    reverse_holofoil: 'RH',
  },
  62: {
    cold_foil: 'CF',
    rainbow_foil: 'RF',
  },
}

function resolveSkuVariantCode(
  tcgtrackingCategoryId: number,
  printingKey: string,
): string | undefined {
  return (
    SKU_VARIANT_CODE_BY_CATEGORY_ID[tcgtrackingCategoryId]?.[printingKey] ??
    DEFAULT_SKU_VARIANT_CODE_BY_PRINTING_KEY[printingKey]
  )
}

function toOptionalCents(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100)
    : undefined
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function normalizePrintingKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildSnapshotFingerprint(snapshot: {
  pricingSource: 'sku' | 'product_fallback'
  tcgMarketPriceCents?: number
  tcgLowPriceCents?: number
  tcgHighPriceCents?: number
  listingCount?: number
  manapoolPriceCents?: number
  manapoolQuantity?: number
}) {
  return JSON.stringify([
    snapshot.pricingSource,
    snapshot.tcgMarketPriceCents ?? null,
    snapshot.tcgLowPriceCents ?? null,
    snapshot.tcgHighPriceCents ?? null,
    snapshot.listingCount ?? null,
    snapshot.manapoolPriceCents ?? null,
    snapshot.manapoolQuantity ?? null,
  ])
}

function resolveManapoolPriceCents(
  pricing: Record<string, unknown> | undefined,
  printingKey: string,
): number | undefined {
  if (!pricing) {
    return undefined
  }

  if (printingKey === 'normal') {
    return toOptionalCents(pricing.normal)
  }

  if (printingKey === 'foil') {
    return toOptionalCents(pricing.foil)
  }

  return toOptionalCents(pricing[printingKey])
}

export function buildSeriesKey(catalogProductKey: string, printingKey: string) {
  return `${catalogProductKey}:${printingKey}`
}

export function buildIssueKey(
  seriesKey: string,
  issueType: PricingResolutionIssueType,
) {
  return `${seriesKey}:${issueType}`
}

export function getTrackedPrintingDefinitions(
  product: Doc<'catalogProducts'>,
): Array<TrackedPrintingDefinition> {
  const tcgPricing = asRecord(product.tcgplayerPricing)
  if (!tcgPricing) {
    return []
  }

  const manapoolPricing = asRecord(product.manapoolPricing)
  const definitions = new Map<string, TrackedPrintingDefinition>()

  for (const [printingLabel, value] of Object.entries(tcgPricing)) {
    const printingValue = asRecord(value)
    if (!printingValue) {
      continue
    }

    const printingKey = normalizePrintingKey(printingLabel)
    if (!printingKey || definitions.has(printingKey)) {
      continue
    }

    definitions.set(printingKey, {
      printingKey,
      printingLabel,
      skuVariantCode: resolveSkuVariantCode(
        product.tcgtrackingCategoryId,
        printingKey,
      ),
      tcgMarketPriceCents: toOptionalCents(printingValue.market),
      tcgLowPriceCents: toOptionalCents(printingValue.low),
      tcgHighPriceCents: toOptionalCents(printingValue.high),
      manapoolPriceCents: resolveManapoolPriceCents(
        manapoolPricing,
        printingKey,
      ),
      manapoolQuantity: toOptionalNumber(product.manapoolQuantity),
    })
  }

  return [...definitions.values()]
}

export function resolveSeriesSnapshot(params: {
  series: Doc<'pricingTrackedSeries'>
  product: Doc<'catalogProducts'>
  skus: Array<Doc<'catalogSkus'>>
  capturedAt: number
}): ResolvedSeriesSnapshot {
  const { series, product, skus, capturedAt } = params
  const definition = getTrackedPrintingDefinitions(product).find(
    (entry) => entry.printingKey === series.printingKey,
  )
  const issues: Array<PricingResolutionIssue> = []
  const nmEnSkus = filterEligibleSkus(skus)
  const matchingSkus =
    typeof series.skuVariantCode === 'string'
      ? nmEnSkus.filter((sku) => sku.variantCode === series.skuVariantCode)
      : []

  if (!series.skuVariantCode) {
    issues.push({
      issueType: 'unmapped_printing',
      details: {
        printingKey: series.printingKey,
        printingLabel: series.printingLabel,
      },
    })
  }

  if (matchingSkus.length > 1) {
    issues.push({
      issueType: 'ambiguous_nm_en_sku',
      details: {
        printingKey: series.printingKey,
        printingLabel: series.printingLabel,
        skuVariantCode: series.skuVariantCode,
        tcgplayerSkus: matchingSkus
          .map((sku) => sku.tcgplayerSku)
          .sort((a, b) => a - b),
      },
    })
  }

  const manapoolPricing = asRecord(product.manapoolPricing)
  const manapoolPriceCents = definition?.manapoolPriceCents
  const manapoolQuantity = definition?.manapoolQuantity

  if (
    manapoolPricing &&
    Object.keys(manapoolPricing).length > 0 &&
    manapoolPriceCents == null
  ) {
    issues.push({
      issueType: 'missing_manapool_match',
      details: {
        printingKey: series.printingKey,
        printingLabel: series.printingLabel,
        availableManapoolKeys: Object.keys(manapoolPricing).sort(),
      },
    })
  }

  if (matchingSkus.length === 1) {
    const sku = matchingSkus[0]
    const snapshot = {
      pricingSource: 'sku' as const,
      preferredCatalogSkuKey: sku.key,
      preferredTcgplayerSku: sku.tcgplayerSku,
      tcgMarketPriceCents: sku.marketPriceCents,
      tcgLowPriceCents: sku.lowPriceCents,
      tcgHighPriceCents: sku.highPriceCents,
      listingCount: sku.listingCount,
      manapoolPriceCents,
      manapoolQuantity,
      effectiveAt:
        sku.pricingUpdatedAt ??
        product.skuPricingUpdatedAt ??
        product.pricingUpdatedAt ??
        capturedAt,
      sourcePricingUpdatedAt: product.pricingUpdatedAt,
      sourceSkuPricingUpdatedAt:
        sku.pricingUpdatedAt ?? product.skuPricingUpdatedAt,
      issues,
    }

    return {
      ...snapshot,
      snapshotFingerprint: buildSnapshotFingerprint(snapshot),
    }
  }

  if (
    definition?.tcgMarketPriceCents == null &&
    definition?.tcgLowPriceCents == null &&
    definition?.tcgHighPriceCents == null
  ) {
    issues.push({
      issueType: 'missing_product_price',
      details: {
        printingKey: series.printingKey,
        printingLabel: series.printingLabel,
      },
    })

    return {
      pricingSource: 'unavailable',
      manapoolPriceCents,
      manapoolQuantity,
      effectiveAt: product.pricingUpdatedAt ?? capturedAt,
      sourcePricingUpdatedAt: product.pricingUpdatedAt,
      sourceSkuPricingUpdatedAt: product.skuPricingUpdatedAt,
      issues,
    }
  }

  const snapshot = {
    pricingSource: 'product_fallback' as const,
    tcgMarketPriceCents: definition.tcgMarketPriceCents,
    tcgLowPriceCents: definition.tcgLowPriceCents,
    tcgHighPriceCents: definition.tcgHighPriceCents,
    listingCount: undefined,
    manapoolPriceCents,
    manapoolQuantity,
    effectiveAt: product.pricingUpdatedAt ?? capturedAt,
    sourcePricingUpdatedAt: product.pricingUpdatedAt,
    sourceSkuPricingUpdatedAt: product.skuPricingUpdatedAt,
    issues,
  }

  return {
    ...snapshot,
    snapshotFingerprint: buildSnapshotFingerprint(snapshot),
  }
}
