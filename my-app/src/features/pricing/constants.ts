export const PICKER_HELPER_TEXT = 'Type at least 2 characters.'

export const ruleTypeStyles: Record<string, string> = {
  manual_product: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
  set: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
  category: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
}

export const pricingSourceStyles: Record<string, string> = {
  sku: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  product_fallback: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  unavailable: 'border-red-500/20 bg-red-500/5 text-red-400',
}

export const pricingSyncStatusStyles: Record<string, string> = {
  idle: 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
  syncing: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
  error: 'border-red-500/20 bg-red-500/5 text-red-400',
}

export const syncModeStyles: Record<string, string> = {
  full: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  pricing_only: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
}

export const issueTypeStyles: Record<string, string> = {
  ambiguous_nm_en_sku: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  unmapped_printing: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
  missing_product_price: 'border-red-500/20 bg-red-500/5 text-red-400',
  missing_manapool_match: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
  sync_error: 'border-red-500/20 bg-red-500/5 text-red-400',
}

export const issueTypeLabels: Record<string, string> = {
  ambiguous_nm_en_sku: 'Ambiguous SKU',
  unmapped_printing: 'Unmapped Printing',
  missing_product_price: 'Missing Price',
  missing_manapool_match: 'Missing Manapool',
  sync_error: 'Sync Error',
}
