import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Archive,
  ArrowRightLeft,
  Boxes,
  DollarSign,
  ExternalLink,
  Hash,
  MapPinned,
  Plus,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { SearchField } from '~/components/ui/search-field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { useSearchController } from '~/hooks/useSearchController'
import { cn } from '~/lib/utils'

type InventoryClass = 'single' | 'sealed' | 'graded'
type InventoryView = 'aggregate' | 'location'

type FlashMessage = {
  kind: 'success' | 'error'
  text: string
} | null

type AggregateRowsResult = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.stock.listAggregateByClass>>
>
type AggregateRow = AggregateRowsResult[number]

type AggregateSummary = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.stock.getAggregateSummary>>
>

type LocationRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.locations.listAssignable>>
>[number]

type ContentRowsResult = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventory.contents.listByLocation>>
>
type ContentRow = ContentRowsResult[number]

const INVENTORY_CLASSES: Array<{ key: InventoryClass; label: string }> = [
  { key: 'single', label: 'Singles' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'graded', label: 'Graded' },
]

const VIEW_MODES: Array<{ key: InventoryView; label: string; icon: any }> = [
  { key: 'aggregate', label: 'Aggregate Stock', icon: Boxes },
  { key: 'location', label: 'By Location', icon: MapPinned },
]

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
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-8 animate-pulse bg-muted/5" />
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
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
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

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: any
}) {
  return (
    <div className="rounded border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function InventoryStatsBar({
  summary,
  activeClass,
}: {
  summary: AggregateSummary | undefined
  activeClass: InventoryClass
}) {
  const activeSummary = summary?.byType[activeClass]
  const activeLabel = INVENTORY_CLASSES.find((entry) => entry.key === activeClass)?.label

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <StatCard
        label="Stock Rows"
        value={summary ? summary.itemCount.toLocaleString() : '--'}
        icon={Archive}
      />
      <StatCard
        label="Total Qty"
        value={summary ? summary.totalQuantity.toLocaleString() : '--'}
        icon={Hash}
      />
      <StatCard
        label="Market Value"
        value={summary ? formatCents(summary.totalMarketValueCents) : '--'}
        icon={DollarSign}
      />
      <StatCard
        label="Locations"
        value={summary ? summary.totalLocationCount.toLocaleString() : '--'}
        icon={MapPinned}
      />
      <StatCard
        label={`${activeLabel} Rows`}
        value={activeSummary ? activeSummary.itemCount.toLocaleString() : '--'}
        icon={Boxes}
      />
      <StatCard
        label={`${activeLabel} Qty`}
        value={activeSummary ? activeSummary.totalQuantity.toLocaleString() : '--'}
        icon={Tags}
      />
      <StatCard
        label={`${activeLabel} Value`}
        value={activeSummary ? formatCents(activeSummary.totalMarketValueCents) : '--'}
        icon={DollarSign}
      />
      <StatCard
        label={`${activeLabel} Locs`}
        value={activeSummary ? activeSummary.totalLocationCount.toLocaleString() : '--'}
        icon={MapPinned}
      />
    </div>
  )
}

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
                    <div className="text-muted-foreground">
                      {product.setKey ?? 'Unknown set'}
                    </div>
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

function CreateLocationModal({
  onClose,
  onFlash,
}: {
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [acceptsContents, setAcceptsContents] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createLocation = useMutation(api.inventory.locations.create)

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      await createLocation({
        code,
        kind: 'physical',
        acceptsContents,
        displayName: displayName.trim() || undefined,
      })
      onFlash({ kind: 'success', text: 'Location created.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title="Create location"
      description="Add an addressable inventory location. Parent locations are inferred from the code when possible."
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Code</label>
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="01:01:01:01:01:01"
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Optional label..."
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={acceptsContents}
            onChange={(event) => setAcceptsContents(event.target.checked)}
          />
          Accept inventory contents
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={!code.trim() || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Creating...' : 'Create location'}
        </Button>
      </div>
    </Modal>
  )
}

function ReceiveStockModal({
  inventoryClass,
  locations,
  onClose,
  onFlash,
}: {
  inventoryClass: InventoryClass
  locations: Array<LocationRow>
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [selectedProductKey, setSelectedProductKey] = useState('')
  const [selectedProductName, setSelectedProductName] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locations[0]?._id ?? '',
  )
  const [quantity, setQuantity] = useState('1')
  const [workflowStatus, setWorkflowStatus] = useState<'available' | 'processing' | 'hold'>(
    'available',
  )
  const [workflowTag, setWorkflowTag] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const receiveIntoLocation = useMutation(api.inventory.contents.receiveIntoLocation)

  async function handleSubmit() {
    const parsedQuantity = parseInt(quantity, 10)
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      onFlash({ kind: 'error', text: 'Quantity must be a positive whole number.' })
      return
    }

    setIsSubmitting(true)
    try {
      await receiveIntoLocation({
        locationId: selectedLocationId as Id<'inventoryLocations'>,
        inventoryClass,
        catalogProductKey: selectedProductKey,
        quantity: parsedQuantity,
        workflowStatus,
        workflowTag: workflowTag.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onFlash({ kind: 'success', text: 'Inventory received into location.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Receive ${inventoryClass} stock`}
      description="Place stock into a physical or system location."
      onClose={onClose}
    >
      <div className="space-y-3">
        <ProductPicker
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
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Location</label>
          <select
            value={selectedLocationId}
            onChange={(event) => setSelectedLocationId(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          >
            {locations.map((location) => (
              <option key={location._id} value={location._id}>
                {location.code}
                {location.displayName ? ` - ${location.displayName}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Workflow</label>
            <select
              value={workflowStatus}
              onChange={(event) =>
                setWorkflowStatus(
                  event.target.value as 'available' | 'processing' | 'hold',
                )
              }
              className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
            >
              <option value="available">Available</option>
              <option value="processing">Processing</option>
              <option value="hold">Hold</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Workflow tag</label>
          <input
            type="text"
            value={workflowTag}
            onChange={(event) => setWorkflowTag(event.target.value)}
            placeholder="Optional tag..."
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes..."
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={!selectedProductKey || !selectedLocationId || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Receiving...' : 'Receive stock'}
        </Button>
      </div>
    </Modal>
  )
}

function MoveContentModal({
  content,
  locations,
  onClose,
  onFlash,
}: {
  content: ContentRow
  locations: Array<LocationRow>
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [toLocationId, setToLocationId] = useState<string>(
    locations.find((location) => location._id !== content.location._id)?._id ?? '',
  )
  const [quantity, setQuantity] = useState(String(content.quantity))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const moveQuantity = useMutation(api.inventory.contents.moveQuantity)

  async function handleSubmit() {
    const parsedQuantity = parseInt(quantity, 10)
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      onFlash({ kind: 'error', text: 'Move quantity must be a positive whole number.' })
      return
    }

    setIsSubmitting(true)
    try {
      await moveQuantity({
        contentId: content._id,
        toLocationId: toLocationId as Id<'inventoryLocations'>,
        quantity: parsedQuantity,
      })
      onFlash({ kind: 'success', text: 'Inventory moved.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title="Move inventory"
      description={content.product.cleanName || content.product.name}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Moving from <span className="font-medium text-foreground">{content.location.code}</span>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Destination</label>
          <select
            value={toLocationId}
            onChange={(event) => setToLocationId(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          >
            {locations
              .filter((location) => location._id !== content.location._id)
              .map((location) => (
                <option key={location._id} value={location._id}>
                  {location.code}
                  {location.displayName ? ` - ${location.displayName}` : ''}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Quantity</label>
          <input
            type="number"
            min={1}
            max={content.quantity}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={!toLocationId || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Moving...' : 'Move inventory'}
        </Button>
      </div>
    </Modal>
  )
}

function WorkflowModal({
  content,
  onClose,
  onFlash,
}: {
  content: ContentRow
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [workflowStatus, setWorkflowStatus] = useState(content.workflowStatus)
  const [workflowTag, setWorkflowTag] = useState(content.workflowTag ?? '')
  const [notes, setNotes] = useState(content.notes ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const updateWorkflowState = useMutation(api.inventory.contents.updateWorkflowState)

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      await updateWorkflowState({
        contentId: content._id,
        workflowStatus,
        workflowTag: workflowTag.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onFlash({ kind: 'success', text: 'Workflow state updated.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title="Update workflow"
      description={content.product.cleanName || content.product.name}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Workflow</label>
          <select
            value={workflowStatus}
            onChange={(event) =>
              setWorkflowStatus(
                event.target.value as 'available' | 'processing' | 'hold',
              )
            }
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          >
            <option value="available">Available</option>
            <option value="processing">Processing</option>
            <option value="hold">Hold</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Workflow tag</label>
          <input
            type="text"
            value={workflowTag}
            onChange={(event) => setWorkflowTag(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button size="xs" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}

function GradedDetailModal({
  content,
  onClose,
  onFlash,
}: {
  content: ContentRow
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [gradingCompany, setGradingCompany] = useState(
    content.unitDetail?.gradingCompany ?? '',
  )
  const [gradeLabel, setGradeLabel] = useState(content.unitDetail?.gradeLabel ?? '')
  const [gradeSortValue, setGradeSortValue] = useState(
    content.unitDetail?.gradeSortValue?.toString() ?? '',
  )
  const [certNumber, setCertNumber] = useState(content.unitDetail?.certNumber ?? '')
  const [notes, setNotes] = useState(content.unitDetail?.notes ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const upsertGradedDetail = useMutation(api.inventory.units.upsertGradedDetail)

  async function handleSubmit() {
    setIsSubmitting(true)
    try {
      await upsertGradedDetail({
        contentId: content._id,
        gradingCompany,
        gradeLabel,
        ...(gradeSortValue.trim()
          ? { gradeSortValue: Number(gradeSortValue) }
          : {}),
        certNumber,
        notes: notes.trim() || undefined,
      })
      onFlash({ kind: 'success', text: 'Graded detail saved.' })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title="Graded detail"
      description={content.product.cleanName || content.product.name}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Company</label>
          <input
            type="text"
            value={gradingCompany}
            onChange={(event) => setGradingCompany(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Grade</label>
          <input
            type="text"
            value={gradeLabel}
            onChange={(event) => setGradeLabel(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Grade sort</label>
          <input
            type="number"
            value={gradeSortValue}
            onChange={(event) => setGradeSortValue(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Cert number</label>
          <input
            type="text"
            value={certNumber}
            onChange={(event) => setCertNumber(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-foreground">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={!gradingCompany.trim() || !gradeLabel.trim() || !certNumber.trim() || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Saving...' : 'Save detail'}
        </Button>
      </div>
    </Modal>
  )
}

function AggregateTable({
  rows,
  inventoryClass,
}: {
  rows: Array<AggregateRow> | undefined
  inventoryClass: InventoryClass
}) {
  if (!rows) {
    return <LoadingSkeleton />
  }

  if (rows.length === 0) {
    return (
      <div className="rounded border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
        No aggregate stock rows yet for this inventory class.
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[280px]">Name</TableHead>
            <TableHead>Set</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Locations</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Market</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.aggregateKey}>
              <TableCell className="max-w-[280px] truncate text-xs font-medium">
                {row.product.tcgplayerUrl ? (
                  <a
                    href={row.product.tcgplayerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline"
                  >
                    <span className="truncate">{row.product.cleanName || row.product.name}</span>
                    <ExternalLink className="size-2.5 shrink-0 text-muted-foreground" />
                  </a>
                ) : (
                  row.product.cleanName || row.product.name
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.set?.name ?? '--'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {inventoryClass === 'graded'
                  ? row.sku?.conditionCode ?? 'Graded'
                  : [row.sku?.conditionCode, row.sku?.variantCode].filter(Boolean).join(' / ') || '--'}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">{row.totalQuantity}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {row.distinctLocationCount}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {(['available', 'processing', 'hold'] as const)
                  .filter((key) => row.workflowBreakdown[key] > 0)
                  .map((key) => `${key}:${row.workflowBreakdown[key]}`)
                  .join(' · ') || '--'}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatCents(row.price.resolvedMarketPriceCents)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums font-medium">
                {formatCents(row.price.totalMarketPriceCents)}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {relativeTime(row.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

function LocationContentsTable({
  rows,
  locations,
  onFlash,
}: {
  rows: Array<ContentRow> | undefined
  locations: Array<LocationRow>
  onFlash: (message: FlashMessage) => void
}) {
  const [movingContent, setMovingContent] = useState<ContentRow | null>(null)
  const [workflowContent, setWorkflowContent] = useState<ContentRow | null>(null)
  const [gradedContent, setGradedContent] = useState<ContentRow | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const removeContent = useMutation(api.inventory.contents.removeContent)

  async function handleRemove(contentId: Id<'inventoryLocationContents'>) {
    setRemovingId(contentId)
    try {
      await removeContent({
        contentId,
        reasonCode: 'manual_remove',
      })
      onFlash({ kind: 'success', text: 'Content removed.' })
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setRemovingId(null)
    }
  }

  if (!rows) {
    return <LoadingSkeleton />
  }

  if (rows.length === 0) {
    return (
      <div className="rounded border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
        This location has no contents for the active inventory class.
      </div>
    )
  }

  return (
    <>
      <section className="overflow-hidden rounded border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Name</TableHead>
              <TableHead>Set</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Market</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="w-[92px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row._id}>
                <TableCell className="max-w-[260px] truncate text-xs font-medium">
                  {row.product.tcgplayerUrl ? (
                    <a
                      href={row.product.tcgplayerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline"
                    >
                      <span className="truncate">{row.product.cleanName || row.product.name}</span>
                      <ExternalLink className="size-2.5 shrink-0 text-muted-foreground" />
                    </a>
                  ) : (
                    row.product.cleanName || row.product.name
                  )}
                  {row.unitDetail && (
                    <div className="text-[10px] text-muted-foreground">
                      {row.unitDetail.gradingCompany} {row.unitDetail.gradeLabel} · {row.unitDetail.certNumber}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.set?.name ?? '--'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[row.sku?.conditionCode, row.sku?.variantCode].filter(Boolean).join(' / ') || '--'}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.quantity}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.workflowStatus}
                  {row.workflowTag ? ` · ${row.workflowTag}` : ''}
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {row.notes ?? '--'}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatCents(row.price.resolvedMarketPriceCents)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums font-medium">
                  {formatCents(row.price.totalMarketPriceCents)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {relativeTime(row.updatedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setMovingContent(row)}
                      aria-label="Move inventory"
                    >
                      <ArrowRightLeft className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setWorkflowContent(row)}
                      aria-label="Update workflow"
                    >
                      <Tags className="size-3" />
                    </button>
                    {row.inventoryClass === 'graded' && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => setGradedContent(row)}
                        aria-label="Edit graded detail"
                      >
                        <Hash className="size-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      disabled={removingId === row._id}
                      onClick={() => void handleRemove(row._id)}
                      aria-label="Remove content"
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

      {movingContent ? (
        <MoveContentModal
          content={movingContent}
          locations={locations}
          onClose={() => setMovingContent(null)}
          onFlash={onFlash}
        />
      ) : null}
      {workflowContent ? (
        <WorkflowModal
          content={workflowContent}
          onClose={() => setWorkflowContent(null)}
          onFlash={onFlash}
        />
      ) : null}
      {gradedContent ? (
        <GradedDetailModal
          content={gradedContent}
          onClose={() => setGradedContent(null)}
          onFlash={onFlash}
        />
      ) : null}
    </>
  )
}

export function InventoryDashboard() {
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [activeClass, setActiveClass] = useState<InventoryClass>('single')
  const [viewMode, setViewMode] = useState<InventoryView>('aggregate')
  const [isCreateLocationOpen, setIsCreateLocationOpen] = useState(false)
  const [isReceiveOpen, setIsReceiveOpen] = useState(false)
  const [selectedLocationId, setSelectedLocationId] =
    useState<Id<'inventoryLocations'> | null>(null)

  const summary = useQuery(api.inventory.stock.getAggregateSummary, {})
  const aggregateRows = useQuery(api.inventory.stock.listAggregateByClass, {
    inventoryClass: activeClass,
  })
  const locations = useQuery(api.inventory.locations.listAssignable, {
    activeOnly: true,
  })
  const locationContents = useQuery(
    api.inventory.contents.listByLocation,
    selectedLocationId
      ? {
          locationId: selectedLocationId,
          inventoryClass: activeClass,
        }
      : 'skip',
  )

  useEffect(() => {
    if (!selectedLocationId && locations && locations.length > 0) {
      setSelectedLocationId(locations[0]._id)
    }
  }, [locations, selectedLocationId])

  return (
    <div className="space-y-4">
      <FlashBanner message={flashMessage} onDismiss={() => setFlashMessage(null)} />

      <div className="flex flex-col gap-3 rounded border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {INVENTORY_CLASSES.map((entry) => (
              <Button
                key={entry.key}
                size="xs"
                variant={activeClass === entry.key ? 'default' : 'outline'}
                onClick={() => setActiveClass(entry.key)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {VIEW_MODES.map((mode) => (
              <Button
                key={mode.key}
                size="xs"
                variant={viewMode === mode.key ? 'secondary' : 'outline'}
                onClick={() => setViewMode(mode.key)}
              >
                <mode.icon className="size-3" />
                {mode.label}
              </Button>
            ))}
            <Button size="xs" variant="outline" onClick={() => setIsCreateLocationOpen(true)}>
              <Plus className="size-3" />
              Create location
            </Button>
            <Button
              size="xs"
              onClick={() => setIsReceiveOpen(true)}
              disabled={!locations || locations.length === 0}
            >
              <Plus className="size-3" />
              Receive stock
            </Button>
          </div>
        </div>

        <InventoryStatsBar summary={summary} activeClass={activeClass} />
      </div>

      {viewMode === 'aggregate' ? (
        <AggregateTable rows={aggregateRows} inventoryClass={activeClass} />
      ) : (
        <div className="space-y-3">
          <div className="rounded border bg-card p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Location
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {selectedLocationId && locations
                    ? locations.find((location) => location._id === selectedLocationId)?.code ??
                      'Select a location'
                    : 'Select a location'}
                </p>
              </div>
              {locations && locations.length > 0 ? (
                <select
                  value={selectedLocationId ?? ''}
                  onChange={(event) =>
                    setSelectedLocationId(
                      event.target.value as Id<'inventoryLocations'>,
                    )
                  }
                  className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                >
                  {locations.map((location) => (
                    <option key={location._id} value={location._id}>
                      {location.code}
                      {location.displayName ? ` - ${location.displayName}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Create a location before tracking contents by location.
                </p>
              )}
            </div>
          </div>

          <LocationContentsTable
            rows={locationContents}
            locations={locations ?? []}
            onFlash={setFlashMessage}
          />
        </div>
      )}

      {isCreateLocationOpen ? (
        <CreateLocationModal
          onClose={() => setIsCreateLocationOpen(false)}
          onFlash={setFlashMessage}
        />
      ) : null}

      {isReceiveOpen && locations ? (
        <ReceiveStockModal
          inventoryClass={activeClass}
          locations={locations}
          onClose={() => setIsReceiveOpen(false)}
          onFlash={setFlashMessage}
        />
      ) : null}
    </div>
  )
}
