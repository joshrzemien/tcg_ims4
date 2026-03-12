import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { getErrorMessage } from '~/features/shared/lib/errors'

export function CreateLocationModal({
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
    <DialogShell
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
    </DialogShell>
  )
}
