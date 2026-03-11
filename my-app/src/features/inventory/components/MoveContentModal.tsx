import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { ContentRow, LocationRow } from '../types'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { getErrorMessage } from '~/features/shared/lib/errors'

export function MoveContentModal({
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
    <DialogShell
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
    </DialogShell>
  )
}
