import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { issueTypeLabels, issueTypeStyles } from '../constants'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import { Button } from '~/components/ui/button'
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
import { getErrorMessage } from '~/features/shared/lib/errors'
import { formatDateTime, relativeTime } from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { cn } from '~/lib/utils'

export function IssuesTab({
  onFlash,
}: {
  onFlash: (msg: FlashMessage) => void
}) {
  const [activeOnly, setActiveOnly] = useState(true)
  const [includeIgnored, setIncludeIgnored] = useState(false)
  const [issueTypeFilter, setIssueTypeFilter] = useState<string | undefined>()
  const [cursor, setCursor] = useState<string | null>(null)
  const [ignoringId, setIgnoringId] = useState<Id<'pricingResolutionIssues'> | null>(
    null,
  )
  const setIssueIgnored = useMutation(api.pricing.mutations.setIssueIgnored)

  const issuesPage = useQuery(api.pricing.queries.listResolutionIssues, {
    activeOnly,
    issueType: issueTypeFilter as never,
    includeIgnored,
    paginationOpts: {
      cursor,
      numItems: 50,
    },
  })

  const issues = issuesPage?.page ?? []
  const hasMore = issuesPage ? !issuesPage.isDone : false

  async function handleIgnore(
    issueId: Id<'pricingResolutionIssues'>,
    ignored: boolean,
  ) {
    setIgnoringId(issueId)
    try {
      await setIssueIgnored({ issueId, ignored })
      onFlash({
        kind: 'success',
        text: ignored ? 'Issue ignored.' : 'Issue restored.',
      })
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIgnoringId(null)
    }
  }

  if (!issuesPage) return <LoadingSkeleton />

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
            activeOnly
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
          onClick={() => {
            setActiveOnly(!activeOnly)
            setCursor(null)
          }}
        >
          Active Only
        </button>
        <button
          type="button"
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
            includeIgnored
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
          onClick={() => {
            setIncludeIgnored(!includeIgnored)
            setCursor(null)
          }}
        >
          Show Ignored
        </button>
        {[
          ['all', 'All Types'],
          ['ambiguous_nm_en_sku', 'Ambiguous SKU'],
          ['unmapped_printing', 'Unmapped'],
          ['missing_product_price', 'Missing Price'],
          ['missing_manapool_match', 'No Manapool'],
          ['sync_error', 'Sync Error'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              (value === 'all' ? !issueTypeFilter : issueTypeFilter === value)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
            onClick={() => {
              setIssueTypeFilter(value === 'all' ? undefined : value)
              setCursor(null)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded border bg-card py-12 text-muted-foreground">
          <AlertTriangle className="size-8 opacity-30" />
          <p className="text-sm">No resolution issues</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-card">
          <Table className="min-w-[800px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="border-border/50 hover:bg-transparent">
                {['Issue', 'Series', 'Set', 'Status', 'Occurrences', 'Last Seen', 'Actions'].map(
                  (heading) => (
                    <TableHead
                      key={heading}
                      className={cn(
                        'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                        heading === 'Occurrences' && 'text-right',
                      )}
                    >
                      {heading}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue, index) => (
                <TableRow
                  key={issue._id}
                  className={cn(
                    'border-border/30',
                    index % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
                  )}
                >
                  <TableCell className="px-2 py-1.5">
                    <div className="flex max-w-[24rem] flex-col gap-1">
                      <Badge
                        className={
                          issueTypeStyles[issue.issueType] ??
                          'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                        }
                      >
                        {issueTypeLabels[issue.issueType] ??
                          humanize(issue.issueType)}
                      </Badge>
                      {typeof issue.details?.message === 'string' && (
                        <span className="text-[10px] leading-relaxed text-muted-foreground">
                          {issue.details.message}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {issue.seriesKey || '--'}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <div className="flex max-w-[18rem] flex-col gap-1">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {issue.setKey}
                      </span>
                      {typeof issue.details?.setName === 'string' && (
                        <span className="text-[10px] text-foreground">
                          {issue.details.setName}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Badge
                      className={
                        issue.ignoredAt
                          ? 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                          : issue.active
                            ? 'border-red-500/20 bg-red-500/5 text-red-400'
                            : 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                      }
                    >
                      {issue.ignoredAt
                        ? 'Ignored'
                        : issue.active
                          ? 'Active'
                          : 'Resolved'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {issue.occurrenceCount}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default text-[10px] tabular-nums text-muted-foreground">
                          {relativeTime(issue.lastSeenAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatDateTime(issue.lastSeenAt)}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void handleIgnore(issue._id, !issue.ignoredAt)}
                      disabled={ignoringId === issue._id}
                    >
                      {issue.ignoredAt ? 'Unignore' : 'Ignore'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <footer className="flex items-center justify-between border-t bg-muted/5 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="tabular-nums">{issues.length} shown</span>
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
              {hasMore && issuesPage.continueCursor && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setCursor(issuesPage.continueCursor)}
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
