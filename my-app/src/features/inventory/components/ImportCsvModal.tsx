import { useState } from 'react'
import { useAction } from 'convex/react'
import { Archive, Boxes, Hash, Tags, X } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { StatCard } from './InventoryStatsBar'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { CsvImportPreview } from '../types'
import { Button } from '~/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { getErrorMessage } from '~/features/shared/lib/errors'

export function ImportCsvModal({
  onClose,
  onFlash,
}: {
  onClose: () => void
  onFlash: (message: FlashMessage) => void
}) {
  const [selectedFileName, setSelectedFileName] = useState('')
  const [storageId, setStorageId] = useState<Id<'_storage'> | null>(null)
  const [preview, setPreview] = useState<CsvImportPreview | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasCommitted, setHasCommitted] = useState(false)

  const generateUploadUrl = useAction(api.inventory.imports.generateUploadUrl)
  const discardUpload = useAction(api.inventory.imports.discardUpload)
  const previewCsvUpload = useAction(api.inventory.imports.previewCsvUpload)
  const commitCsvUpload = useAction(api.inventory.imports.commitCsvUpload)

  async function discardStorageIfNeeded(nextStorageId: Id<'_storage'> | null) {
    if (!nextStorageId || hasCommitted) {
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

    setIsUploading(true)
    setPreview(null)

    try {
      await discardStorageIfNeeded(storageId)

      const uploadUrl = await generateUploadUrl({})
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'text/csv',
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

      const nextPreview = await previewCsvUpload({
        storageId: payload.storageId,
      })

      setSelectedFileName(file.name)
      setStorageId(payload.storageId)
      setPreview(nextPreview as CsvImportPreview)
      setHasCommitted(false)
    } catch (error) {
      setStorageId(null)
      setPreview(null)
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsUploading(false)
    }
  }

  async function handleClose() {
    await discardStorageIfNeeded(storageId)
    onClose()
  }

  async function handleSubmit() {
    if (!storageId || !preview || preview.aggregatedRows === 0) {
      return
    }

    setIsSubmitting(true)
    try {
      const result = (await commitCsvUpload({
        storageId,
      })) as {
        importedContentRows: number
        receivedQuantity: number
        createdLocationCount: number
        createdRuleCount: number
        reactivatedRuleCount: number
        skippedRows: number
      }

      setHasCommitted(true)
      setStorageId(null)
      onFlash({
        kind: 'success',
        text:
          `Imported ${result.importedContentRows} inventory rows / ${result.receivedQuantity} cards.` +
          ` Created ${result.createdLocationCount} locations and ${result.createdRuleCount + result.reactivatedRuleCount} tracking rules updates.` +
          ` Skipped ${result.skippedRows} rows.`,
      })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogShell
      title="Import singles CSV"
      description="Upload a singles CSV. The Remarks column becomes the destination inventory location under IMPORT:*."
      onClose={() => {
        void handleClose()
      }}
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>Only singles are supported in this importer.</p>
          <p>Rows are received additively into inventory with workflow status `available`.</p>
          <p>Resolved sets that are not tracked will get an active set pricing rule automatically.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-foreground">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
            className="block w-full rounded border bg-background px-2 py-2 text-xs text-foreground file:mr-3 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
          />
          <p className="text-[11px] text-muted-foreground">
            {selectedFileName || 'Choose a CSV to upload and preview.'}
          </p>
        </div>

        {isUploading ? (
          <div className="rounded border bg-card px-3 py-4 text-xs text-muted-foreground">
            Uploading and analyzing CSV...
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StatCard label="Rows" value={preview.totalRows.toLocaleString()} icon={Archive} />
              <StatCard label="Matched" value={preview.matchedRows.toLocaleString()} icon={Tags} />
              <StatCard label="Skipped" value={preview.skippedRows.toLocaleString()} icon={X} />
              <StatCard
                label="Receipts"
                value={preview.aggregatedRows.toLocaleString()}
                icon={Boxes}
              />
              <StatCard
                label="Quantity"
                value={preview.totalQuantity.toLocaleString()}
                icon={Hash}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded border bg-card">
                <div className="border-b px-3 py-2 text-xs font-medium text-foreground">
                  Locations To Create
                </div>
                <div className="max-h-48 overflow-y-auto px-3 py-2 text-xs text-muted-foreground">
                  {preview.locationsToCreate.length === 0 ? (
                    <p>No new locations needed.</p>
                  ) : (
                    preview.locationsToCreate.map((location) => (
                      <div key={location.code} className="py-1">
                        <div className="font-medium text-foreground">{location.code}</div>
                        <div>{location.displayName}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded border bg-card">
                <div className="border-b px-3 py-2 text-xs font-medium text-foreground">
                  Sets To Track
                </div>
                <div className="max-h-48 overflow-y-auto px-3 py-2 text-xs text-muted-foreground">
                  {preview.setsToTrack.length === 0 ? (
                    <p>All resolved sets are already tracked.</p>
                  ) : (
                    preview.setsToTrack.map((set) => (
                      <div key={set.setKey} className="py-1">
                        <div className="font-medium text-foreground">{set.setName}</div>
                        <div>{set.setKey}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded border bg-card">
              <div className="border-b px-3 py-2 text-xs font-medium text-foreground">
                Aggregated Receipts
              </div>
              <div className="max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.aggregatedRowSamples.map((row) => (
                      <TableRow key={`${row.locationCode}|${row.catalogSkuKey}`}>
                        <TableCell className="text-xs">{row.locationCode}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.setName}
                        </TableCell>
                        <TableCell className="text-xs">{row.productName}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {row.quantity}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded border bg-card">
              <div className="border-b px-3 py-2 text-xs font-medium text-foreground">
                Skipped Rows
              </div>
              <div className="space-y-3 px-3 py-2">
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {preview.skippedReasonCounts.length === 0 ? (
                    <span>No skipped rows.</span>
                  ) : (
                    preview.skippedReasonCounts.map((entry) => (
                      <span key={entry.reason} className="rounded border px-2 py-1">
                        {entry.reason}: {entry.count}
                      </span>
                    ))
                  )}
                </div>
                {preview.skippedRowSamples.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Set</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.skippedRowSamples.map((row) => (
                          <TableRow key={`${row.rowNumber}|${row.reason}`}>
                            <TableCell className="text-xs">{row.rowNumber}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.setName}
                            </TableCell>
                            <TableCell className="text-xs">{row.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" size="xs" onClick={() => void handleClose()}>
          Cancel
        </Button>
        <Button
          size="xs"
          disabled={isUploading || isSubmitting || !preview || preview.aggregatedRows === 0 || !storageId}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Importing...' : 'Import CSV'}
        </Button>
      </div>
    </DialogShell>
  )
}
