import { useMemo } from 'react'
import { DollarSign,  Package, ShoppingCart, Tag, Truck } from 'lucide-react'
import type {LucideIcon} from 'lucide-react';
import type { OrderRow } from '../types'
import { formatCents } from '~/features/shared/lib/formatting'

function StatCard({
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

export function StatsBar({ orders }: { orders: Array<OrderRow> }) {
  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmountCents, 0)
    const totalItems = orders.reduce((sum, order) => sum + order.itemCount, 0)
    const pendingShipments = orders.filter(
      (order) =>
        order.shippingStatus === 'pending' || order.shippingStatus === 'processing',
    ).length
    const delivered = orders.filter((order) => order.shippingStatus === 'delivered').length
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0

    return { totalRevenue, totalItems, pendingShipments, delivered, avgOrderValue }
  }, [orders])

  const cells = [
    { label: 'Visible Orders', value: orders.length.toLocaleString(), icon: ShoppingCart },
    { label: 'Revenue', value: formatCents(stats.totalRevenue), icon: DollarSign },
    {
      label: 'Pending Shipments',
      value: stats.pendingShipments.toLocaleString(),
      icon: Truck,
    },
    { label: 'Delivered', value: stats.delivered.toLocaleString(), icon: Package },
    { label: 'Total Items', value: stats.totalItems.toLocaleString(), icon: Tag },
    { label: 'Avg Order', value: formatCents(stats.avgOrderValue), icon: DollarSign },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {cells.map((cell) => (
        <StatCard key={cell.label} label={cell.label} value={cell.value} icon={cell.icon} />
      ))}
    </div>
  )
}
