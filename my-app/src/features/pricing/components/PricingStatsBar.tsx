import { AlertTriangle, Layers, TrendingUp } from 'lucide-react'
import type { PricingStats } from '../types'

export function PricingStatsBar({
  stats,
}: {
  stats: PricingStats | undefined
}) {
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
