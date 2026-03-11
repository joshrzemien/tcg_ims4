import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import {
  PICKER_HELPER_TEXT,
  pricingSyncStatusStyles,
  syncModeStyles,
} from '../constants'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import { Button } from '~/components/ui/button'
import { SearchField } from '~/components/ui/search-field'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { StatusBadge as Badge } from '~/features/shared/components/StatusBadge'
import { getErrorMessage } from '~/features/shared/lib/errors'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { useSearchController } from '~/hooks/useSearchController'
import { cn } from '~/lib/utils'

export function CreateRuleModal({
  onClose,
  onFlash,
}: {
  onClose: () => void
  onFlash: (msg: FlashMessage) => void
}) {
  const [ruleType, setRuleType] = useState<'manual_product' | 'set' | 'category'>('set')
  const [keyValue, setKeyValue] = useState('')
  const [label, setLabel] = useState('')
  const [seedExisting, setSeedExisting] = useState(true)
  const [autoTrack, setAutoTrack] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const productSearch = useSearchController({ kind: 'picker' })
  const categorySearch = useSearchController({ kind: 'picker' })
  const setSearch = useSearchController({ kind: 'picker' })

  const createManualProductRule = useMutation(api.pricing.mutations.createManualProductRule)
  const createSetRule = useMutation(api.pricing.mutations.createSetRule)
  const createCategoryRule = useMutation(api.pricing.mutations.createCategoryRule)

  const categories = useQuery(
    api.catalog.queries.searchCategories,
    ruleType === 'category' && categorySearch.committedValue
      ? {
          search: categorySearch.committedValue,
          limit: 25,
        }
      : 'skip',
  )
  const sets = useQuery(
    api.catalog.queries.searchSets,
    ruleType === 'set' && setSearch.committedValue
      ? {
          search: setSearch.committedValue,
          limit: 25,
        }
      : 'skip',
  )
  const selectedSet = useQuery(
    api.catalog.queries.getSetByKey,
    ruleType === 'set' && keyValue ? { setKey: keyValue } : 'skip',
  )
  const searchResults = useQuery(
    api.pricing.queries.searchCatalogProducts,
    ruleType === 'manual_product' && productSearch.committedValue
      ? { search: productSearch.committedValue, limit: 10 }
      : 'skip',
  )

  async function handleSubmit() {
    const trimmedKey = keyValue.trim()
    if (!trimmedKey) return

    setIsSubmitting(true)
    try {
      const trimmedLabel = label.trim() || undefined
      if (ruleType === 'manual_product') {
        await createManualProductRule({
          catalogProductKey: trimmedKey,
          label: trimmedLabel,
        })
      } else if (ruleType === 'set') {
        await createSetRule({ setKey: trimmedKey, label: trimmedLabel })
      } else {
        await createCategoryRule({
          categoryKey: trimmedKey,
          label: trimmedLabel,
          seedExistingSets: seedExisting,
          autoTrackFutureSets: autoTrack,
        })
      }
      onFlash({ kind: 'success', text: 'Tracking rule created. Coverage sync scheduled.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogShell
      title="Create Tracking Rule"
      description="Track prices for a set, category, or individual product."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rule Type
          </label>
          <div className="flex items-center gap-1">
            {(
              [
                ['set', 'Set'],
                ['category', 'Category'],
                ['manual_product', 'Product'],
              ] as const
            ).map(([value, nextLabel]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  ruleType === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
                onClick={() => {
                  setRuleType(value)
                  setKeyValue('')
                  productSearch.clear()
                  categorySearch.clear()
                  setSearch.clear()
                }}
              >
                {nextLabel}
              </button>
            ))}
          </div>
        </div>

        {ruleType === 'manual_product' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Search Product
            </label>
            <SearchField
              value={productSearch.rawValue}
              onValueChange={productSearch.setRawValue}
              onClear={productSearch.clear}
              placeholder="Search by card name..."
              helperText={productSearch.isReady ? undefined : PICKER_HELPER_TEXT}
            />
            {productSearch.committedValue && !searchResults ? (
              <div className="space-y-px rounded border bg-background p-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-8 animate-pulse rounded bg-muted/10" />
                ))}
              </div>
            ) : null}
            {productSearch.committedValue && searchResults && searchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border bg-background">
                {searchResults.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30',
                      keyValue === product.key && 'bg-primary/10 text-primary',
                    )}
                    onClick={() => {
                      setKeyValue(product.key)
                      productSearch.clear()
                      if (!label) setLabel(`Track ${product.name}`)
                    }}
                  >
                    <span className="flex-1 truncate font-medium">{product.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {product.setKey}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {productSearch.committedValue && searchResults && searchResults.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No products match the current search.
              </p>
            )}
            {keyValue && (
              <p className="text-[10px] text-muted-foreground">
                Selected: <span className="font-mono text-foreground">{keyValue}</span>
              </p>
            )}
          </div>
        )}

        {ruleType === 'category' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            <SearchField
              value={categorySearch.rawValue}
              onValueChange={categorySearch.setRawValue}
              onClear={categorySearch.clear}
              placeholder="Search categories..."
              helperText={categorySearch.isReady ? undefined : PICKER_HELPER_TEXT}
            />
            {categorySearch.committedValue && (
              <div className="max-h-40 overflow-y-auto rounded border bg-background">
                {!categories ? (
                  <div className="space-y-px p-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-8 animate-pulse rounded bg-muted/10" />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No categories match the current search.
                  </p>
                ) : (
                  categories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30',
                        keyValue === category.key && 'bg-primary/10 text-primary',
                      )}
                      onClick={() => {
                        setKeyValue(category.key)
                        categorySearch.clear()
                        if (!label) setLabel(`Track category ${category.displayName}`)
                      }}
                    >
                      <span className="flex-1 truncate font-medium">
                        {category.displayName}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {category.setCount} sets · {category.productCount.toLocaleString()} products
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {keyValue && (
              <p className="text-[10px] text-muted-foreground">
                Selected: <span className="font-mono text-foreground">{keyValue}</span>
              </p>
            )}
          </div>
        )}

        {ruleType === 'set' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Set
            </label>
            <SearchField
              value={setSearch.rawValue}
              onValueChange={setSearch.setRawValue}
              onClear={setSearch.clear}
              placeholder="Search sets..."
              helperText={setSearch.isReady ? undefined : PICKER_HELPER_TEXT}
            />
            {setSearch.committedValue && (
              <div className="max-h-48 overflow-y-auto rounded border bg-background">
                {!sets ? (
                  <div className="space-y-px p-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="h-8 animate-pulse rounded bg-muted/10" />
                    ))}
                  </div>
                ) : sets.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No sets match the current search.
                  </p>
                ) : (
                  sets.map((set) => (
                    <button
                      key={set.key}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30',
                        keyValue === set.key && 'bg-primary/10 text-primary',
                      )}
                      onClick={() => {
                        setKeyValue(set.key)
                        setSearch.clear()
                        if (!label) setLabel(`Track set ${set.name}`)
                      }}
                    >
                      <span className="flex-1 truncate font-medium">
                        {set.label}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {set.productCount.toLocaleString()} products
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {keyValue &&
              (() => {
                const selected = selectedSet ?? sets?.find((set) => set.key === keyValue)
                if (!selected) return null

                return (
                  <div className="flex items-center gap-2 rounded border border-border/50 bg-muted/5 px-2 py-1.5">
                    <Badge
                      className={
                        pricingSyncStatusStyles[selected.pricingSyncStatus] ??
                        pricingSyncStatusStyles.idle
                      }
                    >
                      pricing {humanize(selected.pricingSyncStatus)}
                    </Badge>
                    {selected.pendingSyncMode && (
                      <Badge
                        className={
                          syncModeStyles[selected.pendingSyncMode] ??
                          'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                        }
                      >
                        pending {humanize(selected.pendingSyncMode)}
                      </Badge>
                    )}
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {selected.syncedProductCount.toLocaleString()} / {selected.productCount.toLocaleString()} products
                      {' · '}
                      {selected.syncedSkuCount.toLocaleString()} / {selected.skuCount.toLocaleString()} skus synced
                    </span>
                  </div>
                )
              })()}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Label (optional)
          </label>
          <input
            type="text"
            placeholder="Auto-generated if empty"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
          />
        </div>

        {ruleType === 'category' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={seedExisting}
                onChange={(event) => setSeedExisting(event.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-foreground">Seed existing sets</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoTrack}
                onChange={(event) => setAutoTrack(event.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-foreground">
                Auto-track future sets
              </span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!keyValue.trim() || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Creating...' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </DialogShell>
  )
}
