import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { SearchField } from '~/components/ui/search-field'
import { useSearchController } from '~/hooks/useSearchController'

export function ProductPicker({
  selectedProductKey,
  selectedProductName,
  onSelectProduct,
  onClearProduct,
}: {
  selectedProductKey: string
  selectedProductName: string
  onSelectProduct: (key: string, name: string) => void
  onClearProduct: () => void
}) {
  const search = useSearchController({ kind: 'picker' })
  const searchResults = useQuery(
    api.pricing.queries.searchCatalogProducts,
    search.committedValue
      ? { search: search.committedValue, limit: 10 }
      : 'skip',
  )

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-foreground">Product</label>
      {selectedProductKey ? (
        <div className="flex items-center justify-between rounded border bg-muted/30 px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{selectedProductName}</div>
            <div className="truncate text-muted-foreground">{selectedProductKey}</div>
          </div>
          <Button size="xs" variant="outline" onClick={onClearProduct}>
            Clear
          </Button>
        </div>
      ) : (
        <>
          <SearchField
            value={search.rawValue}
            onValueChange={search.setRawValue}
            onClear={search.clear}
            helperText="Type at least 2 characters."
            placeholder="Search catalog products..."
            aria-label="Search catalog products"
          />
          <div className="max-h-48 overflow-y-auto rounded border bg-card">
            {!search.committedValue ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Type at least 2 characters.
              </div>
            ) : !searchResults ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No products found.</div>
            ) : (
              <div className="divide-y">
                {searchResults.map((product) => (
                  <button
                    key={product.key}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
                    onClick={() =>
                      onSelectProduct(
                        product.key,
                        product.cleanName || product.name,
                      )
                    }
                  >
                    <div className="font-medium text-foreground">
                      {product.cleanName || product.name}
                    </div>
                    <div className="text-muted-foreground">{product.setKey}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
