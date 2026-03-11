import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { ContentRow } from '../types'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { getErrorMessage } from '~/features/shared/lib/errors'

export function GradedDetailModal({
  content,
  onClose,
  onFlash,
}: {
  content: ContentRow
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [gradingCompany, setGradingCompany] = useState(content.unitDetail?.gradingCompany ?? '')
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
        ...(gradeSortValue.trim() ? { gradeSortValue: Number(gradeSortValue) } : {}),
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
    <DialogShell
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
    </DialogShell>
  )
}
