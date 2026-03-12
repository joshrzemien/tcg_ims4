import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { pricingSourceStyles } from '../constants'
import { SeriesHistoryPanel } from './SeriesHistoryPanel'
import type { TrackedSeries } from '../types'
import { Button } from '~/components/ui/button'
import { SearchField } from '~/components/ui/search-field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import { LoadingSkeleton } from '~/features/shared/components/LoadingState'
import { StatusBadge as Badge } from '~/features/shared/components/StatusBadge'
import {
  formatCents,
  formatDateTime,
  relativeTime,
} from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { useSearchController } from '~/hooks/useSearchController'
import { normalizeSearchInput } from '~/lib/search'
import { cn } from '~/lib/utils'

function SeriesRow({
  series,
  rowIndex,
  isExpanded,
  onToggleExpand,
}: {
  series: TrackedSeries
  rowIndex: number
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  return (
    <>
      <TableRow
        className={cn(
          'border-border/30 cursor-pointer',
          rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
          isExpanded && 'bg-primary/5',
        )}
        onClick={onToggleExpand}
      >
        <TableCell className="w-6 px-2 py-1.5">
          {isExpanded ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <div className="min-w-0">
            <span className="text-xs font-medium text-foreground">
              {series.name}
            </span>
            {series.number && (
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                #{series.number}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <span className="text-xs text-muted-foreground">
            {series.printingLabel}
          </span>
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <Badge
            className={
              pricingSourceStyles[series.pricingSource] ??
              'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
            }
          >
            {humanize(series.pricingSource)}
          </Badge>
        </TableCell>
        <TableCell className="px-2 py-1.5 text-right">
          <span className="text-xs tabular-nums text-foreground">
            {formatCents(series.currentTcgMarketPriceCents)}
          </span>
        </TableCell>
        <TableCell className="px-2 py-1.5 text-right">
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatCents(series.currentTcgLowPriceCents)}
          </span>
        </TableCell>
        <TableCell className="px-2 py-1.5 text-right">
          <span className="text-xs tabular-nums text-foreground">
            {formatCents(series.currentManapoolPriceCents)}
          </span>
        </TableCell>
        <TableCell className="px-2 py-1.5 text-right">
          <span className="text-xs tabular-nums text-muted-foreground">
            {series.currentManapoolQuantity ?? '--'}
          </span>
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-[10px] tabular-nums text-muted-foreground">
                {relativeTime(series.lastSnapshotAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {formatDateTime(series.lastSnapshotAt)}
            </TooltipContent>
          </Tooltip>
        </TableCell>
      </TableRow>
      {isExpanded && <SeriesHistoryPanel seriesKey={series.key} />}
    </>
  )
}

export function SeriesTab({
  committedSearch,
  activeOnly,
  onCommittedSearchChange,
  onActiveOnlyChange,
}: {
  committedSearch: string
  activeOnly: boolean
  onCommittedSearchChange: (value: string) => void
  onActiveOnlyChange: (value: boolean) => void
}) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const search = useSearchController({
    kind: 'page',
    initialValue: committedSearch,
  })

  useEffect(() => {
    if (search.committedValue !== normalizeSearchInput(committedSearch)) {
      onCommittedSearchChange(search.committedValue)
    }
  }, [committedSearch, onCommittedSearchChange, search.committedValue])

  useEffect(() => {
    setCursor(null)
  }, [activeOnly, committedSearch])

  const seriesPage = useQuery(api.pricing.queries.listTrackedSeries, {
    activeOnly,
    search: committedSearch || undefined,
    paginationOpts: {
      cursor,
      numItems: 50,
    },
  })

  const series = seriesPage?.page ?? []
  const hasMore = seriesPage ? !seriesPage.isDone : false

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchField
            value={search.rawValue}
            onValueChange={search.setRawValue}
            onClear={search.clear}
            placeholder="Search by name, printing, or product key..."
            size="xs"
          />
        </div>
        <button
          type="button"
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
            activeOnly
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
          onClick={() => {
            onActiveOnlyChange(!activeOnly)
          }}
        >
          Active Only
        </button>
      </div>

      {!seriesPage ? (
        <LoadingSkeleton />
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded border bg-card py-12 text-muted-foreground">
          <TrendingUp className="size-8 opacity-30" />
          <p className="text-sm">No tracked series found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-card">
          <Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="border-border/50 hover:bg-transparent">
                {[
                  '',
                  'Card',
                  'Printing',
                  'Source',
                  'Market',
                  'Low',
                  'Manapool',
                  'MP Qty',
                  'Snapshot',
                ].map((heading) => (
                  <TableHead
                    key={heading}
                    className={cn(
                      'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                      ['Market', 'Low', 'Manapool', 'MP Qty'].includes(heading) &&
                        'text-right',
                    )}
                  >
                    {heading}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((entry, index) => (
                <SeriesRow
                  key={entry._id}
                  series={entry}
                  rowIndex={index}
                  isExpanded={expandedKey === entry.key}
                  onToggleExpand={() =>
                    setExpandedKey(expandedKey === entry.key ? null : entry.key)
                  }
                />
              ))}
            </TableBody>
          </Table>

          <footer className="flex items-center justify-between border-t bg-muted/5 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="tabular-nums">{series.length} shown</span>
            <div className="flex items-center gap-2">
              {cursor && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setCursor(null)}
                >
                  First
                </Button>
              )}
              {hasMore && seriesPage.continueCursor && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setCursor(seriesPage.continueCursor)}
                >
                  Load More
                </Button>
              )}
            </div>
          </footer>
        </div>
      )}
    </div>
  )
}
