import type { Doc } from '../_generated/dataModel'

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

const SKU_VARIANT_CODE_BY_SET_ID: Partial<
  Record<number, Partial<Record<string, string>>>
> = {
  1663: {
    unlimited: 'UL',
    unlimited_holofoil: 'ULH',
    '1st_edition': '1E',
    '1st_edition_holofoil': '1EH',
  },
}

function resolveSkuVariantCode(
  tcgtrackingCategoryId: number,
  tcgtrackingSetId: number,
  printingKey: string,
): string | undefined {
  return (
    SKU_VARIANT_CODE_BY_SET_ID[tcgtrackingSetId]?.[printingKey] ??
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
        product.tcgtrackingSetId,
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
