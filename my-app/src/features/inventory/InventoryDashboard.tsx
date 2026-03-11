import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { FileUp, Plus } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { INVENTORY_CLASSES, VIEW_MODES } from './constants'
import { AggregateTable } from './components/AggregateTable'
import { CreateLocationModal } from './components/CreateLocationModal'
import { ImportCsvModal } from './components/ImportCsvModal'
import { InventoryStatsBar } from './components/InventoryStatsBar'
import { LocationContentsTable } from './components/LocationContentsTable'
import { ProductPicker } from './components/ProductPicker'
import { ReceiveStockModal } from './components/ReceiveStockModal'
import type { Id } from '../../../convex/_generated/dataModel'
import type { InventoryClass, InventoryView } from './types'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import { FlashBanner } from '~/features/shared/components/FlashBanner'
import { Button } from '~/components/ui/button'

function LocationView({
  selectedLocationId,
  locations,
  locationContents,
  onChangeLocation,
  onFlash,
}: {
  selectedLocationId: Id<'inventoryLocations'> | null
  locations: NonNullable<ReturnType<typeof useQuery<typeof api.inventory.locations.listAssignable>>>
  locationContents: ReturnType<typeof useQuery<typeof api.inventory.contents.listByLocation>>
  onChangeLocation: (locationId: Id<'inventoryLocations'>) => void
  onFlash: (message: FlashMessage) => void
}) {
  return (
    <div className="space-y-3">
      <div className="rounded border bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Location
            </p>
            <p className="text-sm font-semibold text-foreground">
              {selectedLocationId
                ? locations.find((location) => location._id === selectedLocationId)?.code ??
                  'Select a location'
                : 'Select a location'}
            </p>
          </div>
          {locations.length > 0 ? (
            <select
              value={selectedLocationId ?? ''}
              onChange={(event) => onChangeLocation(event.target.value as Id<'inventoryLocations'>)}
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
        rows={locationContents ?? undefined}
        locations={locations}
        onFlash={onFlash}
      />
    </div>
  )
}

export function InventoryDashboard() {
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [activeClass, setActiveClass] = useState<InventoryClass>('single')
  const [viewMode, setViewMode] = useState<InventoryView>('aggregate')
  const [isCreateLocationOpen, setIsCreateLocationOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
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
            {activeClass === 'single' ? (
              <Button size="xs" variant="outline" onClick={() => setIsImportOpen(true)}>
                <FileUp className="size-3" />
                Import CSV
              </Button>
            ) : null}
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

        <InventoryStatsBar summary={summary ?? undefined} activeClass={activeClass} />
      </div>

      {viewMode === 'aggregate' ? (
        <AggregateTable rows={aggregateRows ?? undefined} inventoryClass={activeClass} />
      ) : (
        <LocationView
          selectedLocationId={selectedLocationId}
          locations={locations ?? []}
          locationContents={locationContents}
          onChangeLocation={setSelectedLocationId}
          onFlash={setFlashMessage}
        />
      )}

      {isCreateLocationOpen ? (
        <CreateLocationModal
          onClose={() => setIsCreateLocationOpen(false)}
          onFlash={setFlashMessage}
        />
      ) : null}

      {isImportOpen ? (
        <ImportCsvModal
          onClose={() => setIsImportOpen(false)}
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

export { ProductPicker }
