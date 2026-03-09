import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Archive,
  DollarSign,
  ExternalLink,
  Hash,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { SearchField } from '~/components/ui/search-field'
import { useSearchController } from '~/hooks/useSearchController'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { cn } from '~/lib/utils'

// -- Types --

type InventoryType = 'single' | 'sealed'

type FlashMessage = {
  kind: 'success' | 'error'
  text: string
} | null

type InventoryRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.queries.listPage>>
>['page'][number]

// -- Formatters --

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function formatCents(cents: number | undefined) {
  if (typeof cents !== 'number') return '--'
  return currencyFormatter.format(cents / 100)
}

function relativeTime(ts: number | undefined) {
  if (typeof ts !== 'number') return 'never'
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

const PICKER_HELPER_TEXT = 'Type at least 2 characters.'

// -- Shared Components --

function FlashBanner({
  message,
  onDismiss,
}: {
  message: FlashMessage
  onDismiss: () => void
}) {
  if (!message) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium',
        message.kind === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          : 'border-red-500/20 bg-red-500/5 text-red-400',
      )}
    >
      <span className="flex-1">{message.text}</span>
      <button type="button" onClick={onDismiss} className="p-0.5">
        <X className="size-3" />
      </button>
    </div>
  )
}

function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded border bg-card">
      <div className="h-8 border-b bg-muted/10" />
      <div className="space-y-px">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse bg-muted/5" />
        ))}
      </div>
    </div>
  )
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-3.5" />
          </button>
        </header>
        <div className="max-h-[80vh] overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  )
}

// -- Stats Bar --

type InventorySummary = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.queries.getSummary>>
>

function InventoryStatsBar({
  summary,
  tabSummary,
  activeTab,
}: {
  summary: InventorySummary | undefined
  tabSummary: InventorySummary | undefined
  activeTab: InventoryType
}) {
  const tabLabel = activeTab === 'sealed' ? 'Sealed' : 'Singles'
  const tabStats = tabSummary?.byType[activeTab]

  const cells = [
    {
      label: 'Total Items',
      value: summary ? summary.itemCount.toLocaleString() : '--',
      icon: Archive,
    },
    {
      label: 'Total Qty',
      value: summary ? summary.totalQuantity.toLocaleString() : '--',
      icon: Hash,
    },
    {
      label: 'Market Value',
      value: summary ? formatCents(summary.totalMarketValueCents) : '--',
      icon: DollarSign,
    },
    {
      label: 'Low Value',
      value: summary ? formatCents(summary.totalLowValueCents) : '--',
      icon: TrendingUp,
    },
    {
      label: `${tabLabel} Items`,
      value: tabStats ? tabStats.itemCount.toLocaleString() : '--',
      icon: Archive,
    },
    {
      label: `${tabLabel} Value`,
      value: tabStats ? formatCents(tabStats.totalMarketValueCents) : '--',
      icon: DollarSign,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded border bg-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            <cell.icon className="size-3 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {cell.label}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// -- Item Form Fields (shared between Add & Edit modals) --

export function ItemFormFields({
  selectedProductKey,
  selectedProductName,
  onSelectProduct,
  onClearProduct,
  quantity,
  onQuantityChange,
  location,
  onLocationChange,
  notes,
  onNotesChange,
  productLocked,
}: {
  selectedProductKey: string
  selectedProductName: string
  onSelectProduct: (key: string, name: string) => void
  onClearProduct: () => void
  quantity: string
  onQuantityChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  notes: string
  onNotesChange: (value: string) => void
  productLocked?: boolean
}) {
  const productSearch = useSearchController({ kind: 'picker' })

  const searchResults = useQuery(
    api.pricing.queries.searchCatalogProducts,
    !productLocked && productSearch.committedValue
      ? { search: productSearch.committedValue, limit: 10 }
      : 'skip',
  )

  return (
    <div className="space-y-3">
      {/* Product search */}
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Product
        </label>
        {selectedProductKey ? (
          <div className="flex items-center gap-2 rounded border bg-muted/10 px-2.5 py-1.5 text-xs">
            <span className="flex-1 truncate font-medium">
              {selectedProductName}
            </span>
            {!productLocked && (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onClearProduct()
                  productSearch.clear()
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ) : (
          <>
            <SearchField
              value={productSearch.rawValue}
              onValueChange={productSearch.setRawValue}
              onClear={productSearch.clear}
              placeholder="Search by product name..."
              helperText={productSearch.isReady ? undefined : PICKER_HELPER_TEXT}
              size="xs"
              autoFocus
            />
            {productSearch.committedValue && !searchResults ? (
              <div className="mt-1 space-y-px rounded border bg-card p-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-8 animate-pulse rounded bg-muted/10"
                  />
                ))}
              </div>
            ) : null}
            {productSearch.committedValue &&
              searchResults &&
              searchResults.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded border bg-card">
                {searchResults.map((product) => (
                  <button
                    key={product.key}
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/50"
                    onClick={() => {
                      onSelectProduct(
                        product.key,
                        product.cleanName || product.name,
                      )
                      productSearch.clear()
                    }}
                  >
                    <span className="flex-1 truncate">
                      {product.cleanName || product.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {product.setKey}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {productSearch.committedValue &&
              searchResults &&
              searchResults.length === 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  No products found.
                </p>
              )}
          </>
        )}
      </div>

      {/* Quantity */}
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Quantity
        </label>
        <input
          type="number"
          min="0"
          value={quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
          className="h-7 w-24 rounded border bg-background px-2 text-xs tabular-nums text-foreground focus:border-ring focus:outline-none"
        />
      </div>

      {/* Location */}
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Location
        </label>
        <input
          type="text"
          placeholder="e.g. Shelf A, Box 3..."
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          className="h-7 w-full rounded border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Notes
        </label>
        <input
          type="text"
          placeholder="Optional notes..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="h-7 w-full rounded border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
        />
      </div>
    </div>
  )
}

// -- Add Item Modal --

function AddItemModal({
  inventoryType,
  onClose,
  onFlash,
}: {
  inventoryType: InventoryType
  onClose: () => void
  onFlash: (msg: FlashMessage) => void
}) {
  const [selectedProductKey, setSelectedProductKey] = useState('')
  const [selectedProductName, setSelectedProductName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addItem = useMutation(api.inventory.mutations.addItem)

  async function handleSubmit() {
    if (!selectedProductKey) return

    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty < 0) {
      onFlash({
        kind: 'error',
        text: 'Quantity must be a non-negative number.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      await addItem({
        inventoryType,
        catalogProductKey: selectedProductKey,
        quantity: qty,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onFlash({ kind: 'success', text: 'Item added to inventory.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Add ${inventoryType === 'sealed' ? 'sealed' : 'singles'} item`}
      description="Search for a product and add it to your inventory."
      onClose={onClose}
    >
      <ItemFormFields
        selectedProductKey={selectedProductKey}
        selectedProductName={selectedProductName}
        onSelectProduct={(key, name) => {
          setSelectedProductKey(key)
          setSelectedProductName(name)
        }}
        onClearProduct={() => {
          setSelectedProductKey('')
          setSelectedProductName('')
        }}
        quantity={quantity}
        onQuantityChange={setQuantity}
        location={location}
        onLocationChange={setLocation}
        notes={notes}
        onNotesChange={setNotes}
      />
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={!selectedProductKey || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Adding...' : 'Add Item'}
        </Button>
      </div>
    </Modal>
  )
}

// -- Edit Item Modal --

function EditItemModal({
  item,
  onClose,
  onFlash,
}: {
  item: InventoryRow
  onClose: () => void
  onFlash: (msg: FlashMessage) => void
}) {
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [location, setLocation] = useState(item.location ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateItem = useMutation(api.inventory.mutations.updateItem)

  async function handleSubmit() {
    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty < 0) {
      onFlash({
        kind: 'error',
        text: 'Quantity must be a non-negative number.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      await updateItem({
        inventoryItemId: item._id,
        quantity: qty,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onFlash({ kind: 'success', text: 'Item updated.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title="Edit inventory item"
      description={item.product.cleanName || item.product.name}
      onClose={onClose}
    >
      <ItemFormFields
        selectedProductKey={item.product.key}
        selectedProductName={item.product.cleanName || item.product.name}
        onSelectProduct={() => {}}
        onClearProduct={() => {}}
        quantity={quantity}
        onQuantityChange={setQuantity}
        location={location}
        onLocationChange={setLocation}
        notes={notes}
        onNotesChange={setNotes}
        productLocked
      />
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  )
}

// -- Inventory Table --

function InventoryTable({
  inventoryType,
  onFlash,
}: {
  inventoryType: InventoryType
  onFlash: (msg: FlashMessage) => void
}) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<InventoryRow | null>(null)

  const inventoryPage = useQuery(api.inventory.queries.listPage, {
    inventoryType,
    paginationOpts: {
      cursor,
      numItems: 50,
    },
  })

  const removeItem = useMutation(api.inventory.mutations.removeItem)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const items = inventoryPage?.page ?? []
  const hasMore = inventoryPage ? !inventoryPage.isDone : false

  async function handleRemove(itemId: Id<'inventoryItems'>) {
    setRemovingId(itemId)
    try {
      await removeItem({ inventoryItemId: itemId })
      onFlash({ kind: 'success', text: 'Item removed.' })
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setRemovingId(null)
    }
  }

  if (!inventoryPage) {
    return <LoadingSkeleton />
  }

  if (items.length === 0 && !cursor) {
    return (
      <div className="rounded border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
        No {inventoryType === 'sealed' ? 'sealed' : 'singles'} items yet. Add
        one to get started.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <section className="overflow-hidden rounded border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Name</TableHead>
                <TableHead>Set</TableHead>
                {inventoryType === 'single' && <TableHead>Variant</TableHead>}
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Market</TableHead>
                <TableHead className="text-right">Low</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="max-w-[260px] truncate text-xs font-medium">
                    {item.product.tcgplayerUrl ? (
                      <a
                        href={item.product.tcgplayerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline"
                      >
                        <span className="truncate">
                          {item.product.cleanName || item.product.name}
                        </span>
                        <ExternalLink className="size-2.5 shrink-0 text-muted-foreground" />
                      </a>
                    ) : (
                      item.product.cleanName || item.product.name
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.set?.name ?? '--'}
                  </TableCell>
                  {inventoryType === 'single' && (
                    <TableCell className="text-xs text-muted-foreground">
                      {item.sku?.conditionCode ?? '--'}
                      {item.sku?.variantCode
                        ? ` / ${item.sku.variantCode}`
                        : ''}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums text-xs">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCents(item.price.resolvedMarketPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatCents(item.price.resolvedLowPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs font-medium">
                    {formatCents(item.price.totalMarketPriceCents)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.location ?? '--'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(item.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => setEditingItem(item)}
                        aria-label="Edit item"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        disabled={removingId === item._id}
                        onClick={() => void handleRemove(item._id)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{items.length} shown</span>
          <div className="flex items-center gap-1.5">
            {cursor && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setCursor(null)}
              >
                First page
              </Button>
            )}
            {hasMore && inventoryPage.continueCursor && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setCursor(inventoryPage.continueCursor)}
              >
                Next page
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onFlash={onFlash}
        />
      )}
    </>
  )
}

// -- Main Dashboard --

export function InventoryDashboard() {
  const [activeTab, setActiveTab] = useState<InventoryType>('sealed')
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const summary = useQuery(api.inventory.queries.getSummary, {})
  const tabSummary = useQuery(api.inventory.queries.getSummary, {
    inventoryType: activeTab,
  })

  function handleFlash(msg: FlashMessage) {
    setFlashMessage(msg)
  }

  return (
    <div className="space-y-3">
      <InventoryStatsBar
        summary={summary}
        tabSummary={tabSummary}
        activeTab={activeTab}
      />

      <FlashBanner
        message={flashMessage}
        onDismiss={() => setFlashMessage(null)}
      />

      {/* Tab bar + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(
            [
              ['sealed', 'Sealed'],
              ['single', 'Singles'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="xs"
          className="gap-1"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="size-3" />
          Add Item
        </Button>
      </div>

      {/* Tab content */}
      <InventoryTable
        key={activeTab}
        inventoryType={activeTab}
        onFlash={handleFlash}
      />

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal
          inventoryType={activeTab}
          onClose={() => setShowAddModal(false)}
          onFlash={handleFlash}
        />
      )}
    </div>
  )
}
