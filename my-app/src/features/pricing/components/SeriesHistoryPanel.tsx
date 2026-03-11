import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { pricingSourceStyles } from '../constants'
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
import { StatusBadge as Badge } from '~/features/shared/components/StatusBadge'
import { formatCents, formatDateTime } from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { cn } from '~/lib/utils'

export function SeriesHistoryPanel({ seriesKey }: { seriesKey: string }) {
  const [rangeDays, setRangeDays] = useState(30)
  const history = useQuery(api.pricing.queries.getSeriesHistory, {
    seriesKey,
    rangeDays,
  })

  return (
    <TableRow className="border-border/30 bg-primary/3">
      <TableCell colSpan={9} className="px-4 py-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">
              Price History
            </h4>
            <div className="flex items-center gap-1">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                    rangeDays === days
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                  onClick={() => setRangeDays(days)}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {!history ? (
            <div className="h-16 animate-pulse rounded bg-muted/10" />
          ) : history.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No price changes recorded in this period
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    {[
                      'Date',
                      'Source',
                      'Market',
                      'Low',
                      'High',
                      'Manapool',
                      'MP Qty',
                      'Listings',
                    ].map((heading) => (
                      <TableHead
                        key={heading}
                        className={cn(
                          'h-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                          ['Market', 'Low', 'High', 'Manapool', 'MP Qty', 'Listings'].includes(
                            heading,
                          ) && 'text-right',
                        )}
                      >
                        {heading}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry, index) => (
                    <TableRow
                      key={entry._id}
                      className={cn(
                        'border-border/20',
                        index % 2 === 0 ? 'bg-transparent' : 'bg-muted/3',
                      )}
                    >
                      <TableCell className="px-2 py-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {formatDateTime(entry.effectiveAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{formatDateTime(entry.effectiveAt)}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <Badge
                          className={
                            pricingSourceStyles[entry.pricingSource] ??
                            'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                          }
                        >
                          {humanize(entry.pricingSource)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <span className="text-[10px] tabular-nums text-foreground">
                          {formatCents(entry.tcgMarketPriceCents)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatCents(entry.tcgLowPriceCents)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatCents(entry.tcgHighPriceCents)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <span className="text-[10px] tabular-nums text-foreground">
                          {formatCents(entry.manapoolPriceCents)}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {entry.manapoolQuantity ?? '--'}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {entry.listingCount ?? '--'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
