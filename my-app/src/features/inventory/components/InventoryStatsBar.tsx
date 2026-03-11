import {
  Archive,
  Boxes,
  DollarSign,
  Hash,
  
  MapPinned
} from 'lucide-react'
import { INVENTORY_CLASSES } from '../constants'
import type {LucideIcon} from 'lucide-react';
import type { AggregateSummary, InventoryClass } from '../types'
import { formatCents } from '~/features/shared/lib/formatting'

export function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

export function InventoryStatsBar({
  summary,
  activeClass,
}: {
  summary: AggregateSummary | undefined
  activeClass: InventoryClass
}) {
  const activeSummary = summary?.byType[activeClass]
  const activeLabel = INVENTORY_CLASSES.find((entry) => entry.key === activeClass)?.label

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <StatCard
        label="Stock Rows"
        value={summary ? summary.itemCount.toLocaleString() : '--'}
        icon={Archive}
      />
      <StatCard
        label="Total Qty"
        value={summary ? summary.totalQuantity.toLocaleString() : '--'}
        icon={Hash}
      />
      <StatCard
        label="Market Value"
        value={summary ? formatCents(summary.totalMarketValueCents) : '--'}
        icon={DollarSign}
      />
      <StatCard
        label="Locations"
        value={summary ? summary.totalLocationCount.toLocaleString() : '--'}
        icon={MapPinned}
      />
      <StatCard
        label={`${activeLabel} Rows`}
        value={activeSummary ? activeSummary.itemCount.toLocaleString() : '--'}
        icon={Boxes}
      />
      <StatCard
        label={`${activeLabel} Qty`}
        value={activeSummary ? activeSummary.totalQuantity.toLocaleString() : '--'}
        icon={Hash}
      />
      <StatCard
        label={`${activeLabel} Value`}
        value={activeSummary ? formatCents(activeSummary.totalMarketValueCents) : '--'}
        icon={DollarSign}
      />
      <StatCard
        label={`${activeLabel} Locs`}
        value={activeSummary ? activeSummary.totalLocationCount.toLocaleString() : '--'}
        icon={MapPinned}
      />
    </div>
  )
}
