import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { ProductPicker } from './ProductPicker'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { InventoryClass, LocationRow, WorkflowStatus } from '../types'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { getErrorMessage } from '~/features/shared/lib/errors'

export function ReceiveStockModal({
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
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?._id ?? '')
  const [quantity, setQuantity] = useState('1')
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('available')
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
    <DialogShell
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
              onChange={(event) => setWorkflowStatus(event.target.value as WorkflowStatus)}
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
    </DialogShell>
  )
}
