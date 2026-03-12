import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ArrowRightLeft, ExternalLink, Hash, Tags, Trash2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { GradedDetailModal } from './GradedDetailModal'
import { MoveContentModal } from './MoveContentModal'
import { WorkflowModal } from './WorkflowModal'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { ContentRow, LocationRow } from '../types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { LoadingSkeleton } from '~/features/shared/components/LoadingState'
import { getErrorMessage } from '~/features/shared/lib/errors'
import { formatCents, relativeTime } from '~/features/shared/lib/formatting'

export function LocationContentsTable({
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
                  {row.unitDetail ? (
                    <div className="text-[10px] text-muted-foreground">
                      {row.unitDetail.gradingCompany} {row.unitDetail.gradeLabel} · {row.unitDetail.certNumber}
                    </div>
                  ) : null}
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
                    {row.inventoryClass === 'graded' ? (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => setGradedContent(row)}
                        aria-label="Edit graded detail"
                      >
                        <Hash className="size-3" />
                      </button>
                    ) : null}
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
