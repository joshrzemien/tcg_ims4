import { ExternalLink } from 'lucide-react'
import type { AggregateRow, InventoryClass } from '../types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { LoadingSkeleton } from '~/features/shared/components/LoadingState'
import { formatCents, relativeTime } from '~/features/shared/lib/formatting'

export function AggregateTable({
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
