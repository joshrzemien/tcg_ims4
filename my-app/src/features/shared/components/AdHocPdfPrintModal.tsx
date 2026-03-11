import { useState } from 'react'
import { useAction } from 'convex/react'
import { Printer } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { DialogShell } from './DialogShell'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from './FlashBanner'
import { Button } from '~/components/ui/button'
import { getErrorMessage } from '~/features/shared/lib/errors'

function isPdfFile(file: File) {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  )
}

function parseCopyCount(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 1
  }

  return Math.min(20, Math.max(1, Math.round(parsed)))
}

export function AdHocPdfPrintModal({
  onClose,
  onFlash,
}: {
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [selectedFileName, setSelectedFileName] = useState('')
  const [storageId, setStorageId] = useState<Id<'_storage'> | null>(null)
  const [copies, setCopies] = useState('1')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasQueued, setHasQueued] = useState(false)

  const generateUploadUrl = useAction(api.printing.actions.generateUploadUrl)
  const discardUpload = useAction(api.printing.actions.discardUpload)
  const queueUploadedPdf = useAction(api.printing.actions.queueUploadedPdf)

  async function discardStorageIfNeeded(nextStorageId: Id<'_storage'> | null) {
    if (!nextStorageId || hasQueued) {
      return
    }

    try {
      await discardUpload({ storageId: nextStorageId })
    } catch {
      // Best-effort cleanup for abandoned uploads.
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      return
    }

    setErrorMessage(null)

    if (!isPdfFile(file)) {
      await discardStorageIfNeeded(storageId)
      setSelectedFileName('')
      setStorageId(null)
      setHasQueued(false)
      setErrorMessage('Only PDF files can be uploaded for ad hoc printing.')
      return
    }

    setIsUploading(true)

    try {
      await discardStorageIfNeeded(storageId)

      const uploadUrl = await generateUploadUrl({})
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/pdf',
        },
        body: file,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const payload = (await response.json()) as { storageId?: Id<'_storage'> }
      if (!payload.storageId) {
        throw new Error('Upload response did not include a storage id')
      }

      setSelectedFileName(file.name)
      setStorageId(payload.storageId)
      setHasQueued(false)
    } catch (error) {
      setSelectedFileName('')
      setStorageId(null)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsUploading(false)
    }
  }

  async function handleClose() {
    await discardStorageIfNeeded(storageId)
    onClose()
  }

  async function handleSubmit() {
    if (!storageId) {
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const normalizedCopies = parseCopyCount(copies)
      await queueUploadedPdf({
        storageId,
        fileName: selectedFileName || undefined,
        copies: normalizedCopies,
      })

      setHasQueued(true)
      setStorageId(null)
      onFlash({
        kind: 'success',
        text:
          `Queued ${selectedFileName || 'PDF'} for printing.` +
          (normalizedCopies > 1 ? ` (${normalizedCopies} copies)` : ''),
      })
      onClose()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogShell
      title="Print ad hoc PDF"
      description="Upload a PDF and send it to the default printer station through the same print queue."
      onClose={() => {
        void handleClose()
      }}
    >
      <div className="space-y-4">
        <div className="rounded border bg-muted/20 p-3 text-xs text-muted-foreground">
          Only PDF uploads are supported here. Uploaded files stay in storage once
          queued so the printer service can fetch the document.
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_96px]">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-foreground">
              PDF file
            </label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              aria-label="PDF file"
              onChange={(event) =>
                void handleFileChange(event.target.files?.[0] ?? null)
              }
              className="block w-full rounded border bg-background px-2 py-2 text-xs text-foreground file:mr-3 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
            />
            <p className="text-[11px] text-muted-foreground">
              {selectedFileName || 'Choose a PDF to upload and queue.'}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="ad-hoc-print-copies"
              className="block text-xs font-medium text-foreground"
            >
              Copies
            </label>
            <input
              id="ad-hoc-print-copies"
              type="number"
              min={1}
              max={20}
              value={copies}
              onChange={(event) => setCopies(event.target.value)}
              className="block w-full rounded border bg-background px-2 py-2 text-xs text-foreground"
            />
            <p className="text-[11px] text-muted-foreground">1 to 20 copies.</p>
          </div>
        </div>

        {isUploading ? (
          <div className="rounded border bg-card px-3 py-4 text-xs text-muted-foreground">
            Uploading PDF...
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" size="xs" onClick={() => void handleClose()}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={isUploading || isSubmitting || !storageId}
          onClick={() => void handleSubmit()}
        >
          <Printer className="size-3.5" />
          {isSubmitting ? 'Queueing...' : 'Print PDF'}
        </Button>
      </div>
    </DialogShell>
  )
}
