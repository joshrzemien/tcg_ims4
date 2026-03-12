import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { ContentRow, WorkflowStatus } from '../types'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { getErrorMessage } from '~/features/shared/lib/errors'

export function WorkflowModal({
  content,
  onClose,
  onFlash,
}: {
  content: ContentRow
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>(content.workflowStatus)
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
    <DialogShell
      title="Update workflow"
      description={content.product.cleanName || content.product.name}
      onClose={onClose}
    >
      <div className="space-y-3">
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
    </DialogShell>
  )
}
