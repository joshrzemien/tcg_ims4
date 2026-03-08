import { useCallback, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Plus,
  RotateCw,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
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
import { cn } from '~/lib/utils'

// -- Types --

type CatalogSetSync = {
  pricingSyncStatus: string
  pendingSyncMode?: string
  scopedSetCount?: number
  pendingSetCount?: number
  syncingSetCount?: number
  errorSetCount?: number
  syncedProductCount: number
  syncedSkuCount: number
}

type TrackingRule = {
  _id: Id<'pricingTrackingRules'>
  ruleType: 'manual_product' | 'set' | 'category'
  categoryGroupKey: string
  categoryGroupLabel: string
  setGroupKey?: string
  setGroupLabel?: string
  scopeLabel: string
  label: string
  active: boolean
  categoryKey?: string
  setKey?: string
  catalogProductKey?: string
  autoTrackFutureSets?: boolean
  createdAt: number
  updatedAt: number
  activeSeriesCount: number
  catalogSetSync?: CatalogSetSync
}
type TrackedSeries = Doc<'pricingTrackedSeries'>
type TabKey = 'rules' | 'series' | 'issues'

type FlashMessage = {
  kind: 'success' | 'error'
  text: string
} | null

// -- Formatters --

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatCents(cents: number | undefined) {
  if (typeof cents !== 'number') return '--'
  return currencyFormatter.format(cents / 100)
}

function formatDate(ts: number | undefined) {
  if (typeof ts !== 'number') return '--'
  return dateFormatter.format(new Date(ts))
}

function formatDateTime(ts: number | undefined) {
  if (typeof ts !== 'number') return '--'
  return dateTimeFormatter.format(new Date(ts))
}

function relativeTime(ts: number | undefined) {
  if (typeof ts !== 'number') return 'never'
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

// -- Style Maps --

const ruleTypeStyles: Record<string, string> = {
  manual_product: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
  set: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
  category: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
}

const pricingSourceStyles: Record<string, string> = {
  sku: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  product_fallback: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  unavailable: 'border-red-500/20 bg-red-500/5 text-red-400',
}

const pricingSyncStatusStyles: Record<string, string> = {
  idle: 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
  syncing: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
  error: 'border-red-500/20 bg-red-500/5 text-red-400',
}

const syncModeStyles: Record<string, string> = {
  full: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  pricing_only: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
}

const issueTypeStyles: Record<string, string> = {
  ambiguous_nm_en_sku: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  unmapped_printing: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
  missing_product_price: 'border-red-500/20 bg-red-500/5 text-red-400',
  missing_manapool_match: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
  sync_error: 'border-red-500/20 bg-red-500/5 text-red-400',
}

const issueTypeLabels: Record<string, string> = {
  ambiguous_nm_en_sku: 'Ambiguous SKU',
  unmapped_printing: 'Unmapped Printing',
  missing_product_price: 'Missing Price',
  missing_manapool_match: 'Missing Manapool',
  sync_error: 'Sync Error',
}

// -- Shared Components --

function Badge({
  children,
  className,
}: {
  children: React.ReactNode
  className: string
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        className,
      )}
    >
      {children}
    </span>
  )
}

function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded border bg-card">
      <div className="h-8 border-b bg-muted/10" />
      <div className="space-y-px">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse bg-muted/5" />
        ))}
      </div>
    </div>
  )
}

function FlashBanner({
  message,
  onDismiss,
}: {
  message: FlashMessage
  onDismiss: () => void
}) {
  if (!message) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium',
        message.kind === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          : 'border-red-500/20 bg-red-500/5 text-red-400',
      )}
    >
      <span className="flex-1">{message.text}</span>
      <button type="button" onClick={onDismiss} className="p-0.5">
        <X className="size-3" />
      </button>
    </div>
  )
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-3.5" />
          </button>
        </header>
        <div className="max-h-[80vh] overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  )
}

// -- Stats Bar --

type PricingStats = {
  totalTrackedSeries: number
  totalActiveTrackedSeries: number
  totalRules: number
  totalActiveRules: number
  totalIssues: number
  totalActiveIssues: number
}

function PricingStatsBar({ stats }: { stats: PricingStats | undefined }) {
  const cells = [
    {
      label: 'Active Rules',
      value: stats ? `${stats.totalActiveRules}/${stats.totalRules}` : '--',
      icon: Layers,
    },
    {
      label: 'Tracked Series',
      value: stats
        ? `${stats.totalActiveTrackedSeries.toLocaleString()} / ${stats.totalTrackedSeries.toLocaleString()}`
        : '--',
      icon: TrendingUp,
    },
    {
      label: 'Active Issues',
      value: stats ? stats.totalActiveIssues.toLocaleString() : '--',
      icon: AlertTriangle,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded border bg-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            <cell.icon className="size-3 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {cell.label}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// -- Rules Tab --

function RuleRow({
  rule,
  rowIndex,
  togglingId,
  deletingId,
  onToggle,
  onDelete,
}: {
  rule: TrackingRule
  rowIndex: number
  togglingId: Id<'pricingTrackingRules'> | null
  deletingId: Id<'pricingTrackingRules'> | null
  onToggle: (rule: TrackingRule) => void
  onDelete: (rule: TrackingRule) => void
}) {
  return (
    <TableRow
      className={cn(
        'border-border/30',
        rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
      )}
    >
      <TableCell className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Badge
            className={
              ruleTypeStyles[rule.ruleType] ??
              'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
            }
          >
            {humanize(rule.ruleType)}
          </Badge>
          <span className="text-xs font-medium text-foreground">
            {rule.label}
          </span>
        </div>
        {rule.ruleType === 'category' && (
          <div className="mt-0.5 pl-0.5">
            <Badge
              className={
                rule.autoTrackFutureSets !== false
                  ? 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400'
                  : 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
              }
            >
              {rule.autoTrackFutureSets !== false
                ? 'auto add new sets'
                : 'no auto add'}
            </Badge>
          </div>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5">
        <Badge
          className={
            rule.active
              ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
              : 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
          }
        >
          {rule.active ? 'Active' : 'Paused'}
        </Badge>
      </TableCell>
      <TableCell className="px-2 py-1.5 text-right">
        <span className="text-xs tabular-nums text-muted-foreground">
          {rule.activeSeriesCount.toLocaleString()}
        </span>
      </TableCell>
      <TableCell className="px-2 py-1.5">
        {rule.catalogSetSync ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <Badge
                className={
                  pricingSyncStatusStyles[
                    rule.catalogSetSync.pricingSyncStatus
                  ] ?? pricingSyncStatusStyles.idle
                }
              >
                {humanize(rule.catalogSetSync.pricingSyncStatus)}
              </Badge>
              {rule.catalogSetSync.pendingSyncMode && (
                <Badge
                  className={
                    syncModeStyles[rule.catalogSetSync.pendingSyncMode] ??
                    'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                  }
                >
                  pending {humanize(rule.catalogSetSync.pendingSyncMode)}
                </Badge>
              )}
              {rule.ruleType === 'category' &&
                !rule.catalogSetSync.pendingSyncMode &&
                (rule.catalogSetSync.pendingSetCount ?? 0) > 0 && (
                  <Badge className="border-zinc-500/20 bg-zinc-500/5 text-zinc-400">
                    {rule.catalogSetSync.pendingSetCount} pending
                  </Badge>
                )}
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {rule.ruleType === 'category'
                ? `${rule.catalogSetSync.scopedSetCount?.toLocaleString() ?? 0} sets · ${rule.catalogSetSync.syncedProductCount.toLocaleString()} products · ${rule.catalogSetSync.syncedSkuCount.toLocaleString()} skus`
                : `${rule.catalogSetSync.syncedProductCount.toLocaleString()} products · ${rule.catalogSetSync.syncedSkuCount.toLocaleString()} skus`}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">--</span>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5">
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatDate(rule.createdAt)}
        </span>
      </TableCell>
      <TableCell className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onToggle(rule)}
                disabled={
                  togglingId === rule._id || deletingId === rule._id
                }
              >
                {rule.active ? (
                  <EyeOff className="size-3" />
                ) : (
                  <Eye className="size-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {rule.active ? 'Pause rule' : 'Activate rule'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-red-400 hover:text-red-300"
                onClick={() => onDelete(rule)}
                disabled={
                  deletingId === rule._id || togglingId === rule._id
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete rule</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  )
}

function RulesTab({
  rules,
  onFlash,
}: {
  rules: Array<TrackingRule> | undefined
  onFlash: (msg: FlashMessage) => void
}) {
  const setRuleActive = useMutation(api.pricing.mutations.setRuleActive)
  const deleteRule = useMutation(api.pricing.mutations.deleteRule)
  const [deletingId, setDeletingId] = useState<Id<'pricingTrackingRules'> | null>(null)
  const [togglingId, setTogglingId] = useState<Id<'pricingTrackingRules'> | null>(null)

  async function handleToggle(rule: TrackingRule) {
    setTogglingId(rule._id)
    try {
      await setRuleActive({ ruleId: rule._id, active: !rule.active })
      onFlash({
        kind: 'success',
        text: `Rule "${rule.label}" ${rule.active ? 'paused' : 'activated'}.`,
      })
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(rule: TrackingRule) {
    setDeletingId(rule._id)
    try {
      await deleteRule({ ruleId: rule._id })
      onFlash({ kind: 'success', text: `Rule "${rule.label}" deleted.` })
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setDeletingId(null)
    }
  }

  if (!rules) return <LoadingSkeleton />

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded border bg-card py-12 text-muted-foreground">
        <Layers className="size-8 opacity-30" />
        <p className="text-sm">No tracking rules yet</p>
        <p className="text-xs">
          Create a rule to start tracking prices for sets, categories, or
          individual cards.
        </p>
      </div>
    )
  }

  const categoryGroups: Array<{
    key: string
    label: string
    categoryRules: Array<TrackingRule>
    setGroups: Array<{
      key: string
      label: string
      rules: Array<TrackingRule>
    }>
  }> = []

  for (const rule of rules) {
    let categoryGroup = categoryGroups.find(
      (group) => group.key === rule.categoryGroupKey,
    )
    if (!categoryGroup) {
      categoryGroup = {
        key: rule.categoryGroupKey,
        label: rule.categoryGroupLabel,
        categoryRules: [],
        setGroups: [],
      }
      categoryGroups.push(categoryGroup)
    }

    if (rule.ruleType === 'category' || !rule.setGroupKey) {
      categoryGroup.categoryRules.push(rule)
      continue
    }

    const existingSetGroup = categoryGroup.setGroups.find(
      (group) => group.key === rule.setGroupKey,
    )
    if (existingSetGroup) {
      existingSetGroup.rules.push(rule)
      continue
    }

    categoryGroup.setGroups.push({
      key: rule.setGroupKey,
      label: rule.setGroupLabel ?? rule.setGroupKey,
      rules: [rule],
    })
  }

  return (
    <div className="overflow-x-auto rounded border bg-card">
      <Table className="min-w-[700px]">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="border-border/50 hover:bg-transparent">
            {['Rule', 'Status', 'Series', 'Sync', 'Created', ''].map(
              (h) => (
                <TableHead
                  key={h || '_actions'}
                  className={cn(
                    'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                    h === 'Series' && 'text-right',
                  )}
                >
                  {h}
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {categoryGroups.flatMap((categoryGroup, categoryIndex) => [
            <TableRow
              key={`category:${categoryGroup.key}`}
              className={cn(
                'border-border/40 bg-muted/10 hover:bg-muted/10',
                categoryIndex > 0 && 'border-t-2',
              )}
            >
              <TableCell colSpan={6} className="px-2 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        className="border-orange-500/20 bg-orange-500/5 text-orange-400"
                      >
                        category
                      </Badge>
                      <span className="truncate text-xs font-semibold text-foreground">
                        {categoryGroup.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {(
                        categoryGroup.categoryRules.length +
                        categoryGroup.setGroups.reduce(
                          (sum, setGroup) => sum + setGroup.rules.length,
                          0,
                        )
                      ).toLocaleString()}{' '}
                      rule
                      {categoryGroup.categoryRules.length +
                        categoryGroup.setGroups.reduce(
                          (sum, setGroup) => sum + setGroup.rules.length,
                          0,
                        ) === 1
                        ? ''
                        : 's'}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {[
                      ...categoryGroup.categoryRules,
                      ...categoryGroup.setGroups.flatMap((setGroup) => setGroup.rules),
                    ]
                      .reduce((sum, rule) => sum + rule.activeSeriesCount, 0)
                      .toLocaleString()}{' '}
                    series
                  </span>
                </div>
              </TableCell>
            </TableRow>,
            ...categoryGroup.categoryRules.map((rule, ruleIndex) => (
              <RuleRow
                key={rule._id}
                rule={rule}
                rowIndex={ruleIndex}
                togglingId={togglingId}
                deletingId={deletingId}
                onToggle={(r) => void handleToggle(r)}
                onDelete={(r) => void handleDelete(r)}
              />
            )),
            ...categoryGroup.setGroups.flatMap((setGroup) =>
              setGroup.rules.map((rule, ruleIndex) => (
                <RuleRow
                  key={rule._id}
                  rule={rule}
                  rowIndex={ruleIndex}
                  togglingId={togglingId}
                  deletingId={deletingId}
                  onToggle={(r) => void handleToggle(r)}
                  onDelete={(r) => void handleDelete(r)}
                />
              )),
            ),
          ])}
        </TableBody>
      </Table>
    </div>
  )
}

// -- Series Tab --

function SeriesTab(_props: {
  onFlash: (msg: FlashMessage) => void
}) {
  const [searchText, setSearchText] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const seriesPage = useQuery(api.pricing.queries.listTrackedSeries, {
    activeOnly,
    search: searchText || undefined,
    paginationOpts: {
      cursor,
      numItems: 50,
    },
  })

  const series = seriesPage?.page ?? []
  const hasMore = seriesPage ? !seriesPage.isDone : false

  return (
    <div className="space-y-2">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, printing, or product key..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setCursor(null)
            }}
            className="h-7 w-full rounded border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
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
            setActiveOnly(!activeOnly)
            setCursor(null)
          }}
        >
          Active Only
        </button>
      </div>

      {/* Table */}
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
                ].map((h) => (
                  <TableHead
                    key={h}
                    className={cn(
                      'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                      ['Market', 'Low', 'Manapool', 'MP Qty'].includes(h) &&
                        'text-right',
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((s, i) => (
                <SeriesRow
                  key={s._id}
                  series={s}
                  rowIndex={i}
                  isExpanded={expandedKey === s.key}
                  onToggleExpand={() =>
                    setExpandedKey(expandedKey === s.key ? null : s.key)
                  }
                />
              ))}
            </TableBody>
          </Table>

          {/* Pagination footer */}
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

function SeriesHistoryPanel({ seriesKey }: { seriesKey: string }) {
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
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                    rangeDays === d
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                  onClick={() => setRangeDays(d)}
                >
                  {d}d
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
                    ].map((h) => (
                      <TableHead
                        key={h}
                        className={cn(
                          'h-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                          ['Market', 'Low', 'High', 'Manapool', 'MP Qty', 'Listings'].includes(h) && 'text-right',
                        )}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry, i) => (
                    <TableRow
                      key={entry._id}
                      className={cn(
                        'border-border/20',
                        i % 2 === 0 ? 'bg-transparent' : 'bg-muted/3',
                      )}
                    >
                      <TableCell className="px-2 py-1">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatDateTime(entry.effectiveAt)}
                        </span>
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

// -- Issues Tab --

function IssuesTab({ onFlash }: { onFlash: (msg: FlashMessage) => void }) {
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
    issueType: issueTypeFilter as any,
    includeIgnored,
    paginationOpts: {
      cursor,
      numItems: 50,
    },
  })

  const issues = issuesPage?.page ?? []
  const hasMore = issuesPage ? !issuesPage.isDone : false

  async function handleIgnore(issueId: Id<'pricingResolutionIssues'>, ignored: boolean) {
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
      {/* Filters */}
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
                  (h) => (
                    <TableHead
                      key={h}
                      className={cn(
                        'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                        h === 'Occurrences' && 'text-right',
                      )}
                    >
                      {h}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue, i) => (
                <TableRow
                  key={issue._id}
                  className={cn(
                    'border-border/30',
                    i % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
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
                      onClick={() =>
                        void handleIgnore(issue._id, !issue.ignoredAt)
                      }
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

// -- Create Rule Modal --

function CreateRuleModal({
  onClose,
  onFlash,
}: {
  onClose: () => void
  onFlash: (msg: FlashMessage) => void
}) {
  const [ruleType, setRuleType] = useState<'manual_product' | 'set' | 'category'>('set')
  const [keyValue, setKeyValue] = useState('')
  const [label, setLabel] = useState('')
  const [seedExisting, setSeedExisting] = useState(true)
  const [autoTrack, setAutoTrack] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchText, setSearchText] = useState('')

  const createManualProductRule = useMutation(api.pricing.mutations.createManualProductRule)
  const createSetRule = useMutation(api.pricing.mutations.createSetRule)
  const createCategoryRule = useMutation(api.pricing.mutations.createCategoryRule)

  const categories = useQuery(
    api.catalog.queries.listCategories,
    ruleType === 'category'
      ? {
          search: searchText.trim() || undefined,
          limit: 25,
        }
      : 'skip',
  )
  const sets = useQuery(
    api.catalog.queries.listSets,
    ruleType === 'set'
      ? {
          search: searchText.trim() || undefined,
          limit: 25,
        }
      : 'skip',
  )
  const selectedSet = useQuery(
    api.catalog.queries.getSetByKey,
    ruleType === 'set' && keyValue ? { setKey: keyValue } : 'skip',
  )

  const searchResults = useQuery(
    api.pricing.queries.searchCatalogProducts,
    ruleType === 'manual_product' && searchText.trim().length >= 2
      ? { search: searchText, limit: 10 }
      : 'skip',
  )

  async function handleSubmit() {
    const trimmedKey = keyValue.trim()
    if (!trimmedKey) return

    setIsSubmitting(true)
    try {
      const trimmedLabel = label.trim() || undefined
      if (ruleType === 'manual_product') {
        await createManualProductRule({
          catalogProductKey: trimmedKey,
          label: trimmedLabel,
        })
      } else if (ruleType === 'set') {
        await createSetRule({ setKey: trimmedKey, label: trimmedLabel })
      } else {
        await createCategoryRule({
          categoryKey: trimmedKey,
          label: trimmedLabel,
          seedExistingSets: seedExisting,
          autoTrackFutureSets: autoTrack,
        })
      }
      onFlash({ kind: 'success', text: `Tracking rule created. Coverage sync scheduled.` })
      onClose()
    } catch (error) {
      onFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title="Create Tracking Rule"
      description="Track prices for a set, category, or individual product."
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Rule type selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rule Type
          </label>
          <div className="flex items-center gap-1">
            {(
              [
                ['set', 'Set'],
                ['category', 'Category'],
                ['manual_product', 'Product'],
              ] as const
            ).map(([value, lbl]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  ruleType === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
                onClick={() => {
                  setRuleType(value)
                  setKeyValue('')
                  setSearchText('')
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Product search for manual_product */}
        {ruleType === 'manual_product' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Search Product
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by card name..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-8 w-full rounded border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
              />
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border bg-background">
                {searchResults.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30',
                      keyValue === product.key &&
                        'bg-primary/10 text-primary',
                    )}
                    onClick={() => {
                      setKeyValue(product.key)
                      if (!label) setLabel(`Track ${product.name}`)
                    }}
                  >
                    <span className="flex-1 truncate font-medium">
                      {product.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {product.setKey}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {keyValue && (
              <p className="text-[10px] text-muted-foreground">
                Selected:{' '}
                <span className="font-mono text-foreground">{keyValue}</span>
              </p>
            )}
          </div>
        )}

        {/* Category search */}
        {ruleType === 'category' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            {!categories ? (
              <div className="h-8 animate-pulse rounded border bg-muted/10" />
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="h-8 w-full rounded border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded border bg-background">
                  {(categories?.length ?? 0) === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {searchText.trim()
                        ? 'No categories match the current search.'
                        : 'No categories available.'}
                    </p>
                  ) : (
                    categories!.map((cat) => (
                      <button
                        key={cat.key}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30',
                          keyValue === cat.key && 'bg-primary/10 text-primary',
                        )}
                        onClick={() => {
                          setKeyValue(cat.key)
                          if (!label) setLabel(`Track category ${cat.displayName}`)
                        }}
                      >
                        <span className="flex-1 truncate font-medium">
                          {cat.displayName}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {cat.setCount} sets · {cat.productCount.toLocaleString()} products
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {keyValue && (
                  <p className="text-[10px] text-muted-foreground">
                    Selected:{' '}
                    <span className="font-mono text-foreground">{keyValue}</span>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Set search */}
        {ruleType === 'set' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Set
            </label>
            {!sets ? (
              <div className="h-8 animate-pulse rounded border bg-muted/10" />
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search sets..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="h-8 w-full rounded border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded border bg-background">
                  {(sets?.length ?? 0) === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {searchText.trim()
                        ? 'No sets match the current search.'
                        : 'No sets available.'}
                    </p>
                  ) : (
                    sets!.map((set) => (
                      <button
                        key={set.key}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/30',
                          keyValue === set.key && 'bg-primary/10 text-primary',
                        )}
                        onClick={() => {
                          setKeyValue(set.key)
                          if (!label) setLabel(`Track set ${set.name}`)
                        }}
                      >
                        <span className="flex-1 truncate font-medium">
                          {set.label}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {set.productCount.toLocaleString()} products
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {/* Sync status detail for selected set */}
                {keyValue && (() => {
                  const selected =
                    selectedSet ?? sets?.find((s) => s.key === keyValue)
                  if (!selected) return null
                  return (
                    <div className="flex items-center gap-2 rounded border border-border/50 bg-muted/5 px-2 py-1.5">
                      <Badge
                        className={
                          pricingSyncStatusStyles[selected.pricingSyncStatus] ??
                          pricingSyncStatusStyles.idle
                        }
                      >
                        pricing {humanize(selected.pricingSyncStatus)}
                      </Badge>
                      {selected.pendingSyncMode && (
                        <Badge
                          className={
                            syncModeStyles[selected.pendingSyncMode] ??
                            'border-zinc-500/20 bg-zinc-500/5 text-zinc-400'
                          }
                        >
                          pending {humanize(selected.pendingSyncMode)}
                        </Badge>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {selected.syncedProductCount.toLocaleString()} / {selected.productCount.toLocaleString()} products
                        {' · '}
                        {selected.syncedSkuCount.toLocaleString()} / {selected.skuCount.toLocaleString()} skus synced
                      </span>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )}

        {/* Optional label */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Label (optional)
          </label>
          <input
            type="text"
            placeholder="Auto-generated if empty"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 w-full rounded border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
          />
        </div>

        {/* Category-specific options */}
        {ruleType === 'category' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={seedExisting}
                onChange={(e) => setSeedExisting(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-foreground">
                Seed existing sets
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoTrack}
                onChange={(e) => setAutoTrack(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-foreground">
                Auto-track future sets
              </span>
            </label>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!keyValue.trim() || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Creating...' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// -- Main Dashboard --

export function PricingDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('rules')
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [syncingCatalog, setSyncingCatalog] = useState(false)

  const rules = useQuery(
    api.pricing.queries.listRules,
    activeTab === 'rules' ? {} : 'skip',
  )
  const pricingStats = useQuery(api.pricing.queries.getPricingStats)
  const syncCatalogNow = useAction(api.catalog.sync.syncCatalogNow)

  const handleFlash = useCallback((msg: FlashMessage) => {
    setFlashMessage(msg)
  }, [])

  async function handleSyncCatalogNow() {
    setSyncingCatalog(true)
    try {
      const result = await syncCatalogNow({})
      handleFlash({
        kind: 'success',
        text:
          result.scheduled > 0
            ? `Catalog sync queued for ${result.scheduled} set${result.scheduled === 1 ? '' : 's'}.`
            : 'Catalog sync ran, but no eligible sets needed queueing.',
      })
    } catch (error) {
      handleFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setSyncingCatalog(false)
    }
  }

  return (
    <div className="space-y-3">
      <PricingStatsBar stats={pricingStats} />

      <FlashBanner
        message={flashMessage}
        onDismiss={() => setFlashMessage(null)}
      />

      {/* Tab bar + action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(
            [
              ['rules', 'Rules'],
              ['series', 'Tracked Series'],
              ['issues', 'Issues'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => void handleSyncCatalogNow()}
            disabled={syncingCatalog}
          >
            <RotateCw
              className={cn('size-3', syncingCatalog && 'animate-spin')}
            />
            {syncingCatalog ? 'Syncing...' : 'Sync Catalog Now'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="size-3" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'rules' && (
        <RulesTab rules={rules} onFlash={handleFlash} />
      )}
      {activeTab === 'series' && <SeriesTab onFlash={handleFlash} />}
      {activeTab === 'issues' && <IssuesTab onFlash={handleFlash} />}

      {/* Create Rule Modal */}
      {showCreateModal && (
        <CreateRuleModal
          onClose={() => setShowCreateModal(false)}
          onFlash={handleFlash}
        />
      )}
    </div>
  )
}
