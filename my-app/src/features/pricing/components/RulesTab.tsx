import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Eye, EyeOff, Layers, Trash2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import {
  pricingSyncStatusStyles,
  ruleTypeStyles,
  syncModeStyles,
} from '../constants'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { TrackingRule } from '../types'
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
import { formatDate } from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { cn } from '~/lib/utils'

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
                disabled={togglingId === rule._id || deletingId === rule._id}
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
                disabled={deletingId === rule._id || togglingId === rule._id}
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

export function RulesTab({
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
            {['Rule', 'Status', 'Series', 'Sync', 'Created', ''].map((heading) => (
              <TableHead
                key={heading || '_actions'}
                className={cn(
                  'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                  heading === 'Series' && 'text-right',
                )}
              >
                {heading}
              </TableHead>
            ))}
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
                      <Badge className="border-orange-500/20 bg-orange-500/5 text-orange-400">
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
                      .reduce((sum, groupedRule) => sum + groupedRule.activeSeriesCount, 0)
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
                onToggle={(nextRule) => void handleToggle(nextRule)}
                onDelete={(nextRule) => void handleDelete(nextRule)}
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
                  onToggle={(nextRule) => void handleToggle(nextRule)}
                  onDelete={(nextRule) => void handleDelete(nextRule)}
                />
              )),
            ),
          ])}
        </TableBody>
      </Table>
    </div>
  )
}
