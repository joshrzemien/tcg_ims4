import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Package,
  Printer,
  RefreshCw,
  ShoppingCart,
  Tag,
  Truck,
  Undo2,
  X,
} from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { formatShippingMethodLabel } from '../../shared/shippingMethod'
import {
  formatShippingStatusLabel,
  hasRefundedPostage,
  normalizeStatusToken,
} from '../../shared/shippingStatus'
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table'
import type { Doc } from '../../convex/_generated/dataModel'
import type { ShippingMethod } from '../../shared/shippingMethod'
import type { ShippingStatus } from '../../shared/shippingStatus'
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

type OrderRow = Omit<Doc<'orders'>, 'shippingStatus' | 'shippingMethod'> & {
  shippingStatus: ShippingStatus
  shippingMethod: ShippingMethod
  trackingPublicUrl?: string
  latestShipment?: {
    _id: Doc<'shipments'>['_id']
    easypostShipmentId: string
    status: ShippingStatus
    trackingNumber?: string
    labelUrl?: string
    refundStatus?: string
    trackingStatus?: ShippingStatus
    carrier?: string
    service?: string
    rateCents?: number
    createdAt?: number
    updatedAt?: number
  }
}

type PurchaseQuote = {
  shippingMethod: ShippingMethod
  predefinedPackage: 'letter' | 'parcel'
  weightOz: number
  quantity: number
  service: 'First' | 'GroundAdvantage'
  addressVerified: boolean
  verificationErrors: Array<string>
  verifiedAddress: {
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  rate: {
    rateId: string
    carrier: string
    service: string
    rateCents: number
    deliveryDays: number | null
  }
}

type PresetFilter = 'all' | 'last7' | 'last30' | 'unfulfilled' | 'not_delivered'

type FlashMessage =
  | {
      kind: 'success' | 'error'
      text: string
    }
  | null

const columnHelper = createColumnHelper<OrderRow>()

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: '2-digit',
})

// Muted, subtle status styles for the dense dashboard aesthetic
const statusStyles: Record<ShippingStatus, string> = {
  pending:
    'border-amber-500/20 bg-amber-500/5 text-amber-400',
  processing:
    'border-blue-500/20 bg-blue-500/5 text-blue-400',
  created:
    'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
  purchased:
    'border-sky-500/20 bg-sky-500/5 text-sky-400',
  pre_transit:
    'border-blue-500/20 bg-blue-500/5 text-blue-400',
  in_transit:
    'border-indigo-500/20 bg-indigo-500/5 text-indigo-400',
  out_for_delivery:
    'border-teal-500/20 bg-teal-500/5 text-teal-400',
  shipped:
    'border-indigo-500/20 bg-indigo-500/5 text-indigo-400',
  delivered:
    'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  available_for_pickup:
    'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  return_to_sender:
    'border-orange-500/20 bg-orange-500/5 text-orange-400',
  failure:
    'border-red-500/20 bg-red-500/5 text-red-400',
  error:
    'border-red-500/20 bg-red-500/5 text-red-400',
  cancelled:
    'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
  refunded:
    'border-red-500/20 bg-red-500/5 text-red-400',
  replaced:
    'border-violet-500/20 bg-violet-500/5 text-violet-400',
  unknown:
    'border-slate-500/20 bg-slate-500/5 text-slate-400',
}

const fulfillmentStyles = {
  fulfilled:
    'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  unfulfilled:
    'border-amber-500/20 bg-amber-500/5 text-amber-400',
}

const channelStyles: Record<string, string> = {
  tcgplayer: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
  manapool: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
}

const numericColumns = new Set(['itemCount', 'totalAmountCents', 'createdAt'])
const columnWidths: Partial<Record<string, string>> = {
  select: 'w-[2rem] min-w-[2rem]',
  orderNumber: 'w-[9rem] min-w-[9rem]',
  channel: 'w-[5.5rem] min-w-[5.5rem]',
  customerName: 'w-[12rem] min-w-[12rem]',
  shippingStatus: 'w-[9rem] min-w-[9rem]',
  fulfillmentStatus: 'w-[5rem] min-w-[5rem]',
  shippingMethod: 'w-[6rem] min-w-[6rem]',
  itemCount: 'w-[3.5rem] min-w-[3.5rem]',
  totalAmountCents: 'w-[5.5rem] min-w-[5.5rem]',
  createdAt: 'w-[7rem] min-w-[7rem]',
  actions: 'w-[5.5rem] min-w-[5.5rem]',
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

function getColumnWidthClass(columnId: string) {
  return columnWidths[columnId] ?? ''
}

function getOrderUrl(order: OrderRow) {
  const encodedOrderNumber = encodeURIComponent(order.orderNumber)
  if (order.channel === 'tcgplayer') {
    return `https://sellerportal.tcgplayer.com/orders/${encodedOrderNumber}`
  }
  if (order.channel === 'manapool') {
    return `https://manapool.com/seller/orders/${encodedOrderNumber}`
  }
  return null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function shipmentHasPurchasedLabel(shipment?: OrderRow['latestShipment']) {
  return Boolean(
    shipment?.trackingNumber || shipment?.labelUrl || shipment?.trackingStatus,
  )
}

function hasActivePurchasedShipment(order: OrderRow) {
  return (
    shipmentHasPurchasedLabel(order.latestShipment) &&
    !hasRefundedPostage(order.latestShipment?.refundStatus)
  )
}

function canRepurchaseShipment(shipment?: OrderRow['latestShipment']) {
  return !shipment || hasRefundedPostage(shipment.refundStatus)
}

function formatRateLabel(rate: PurchaseQuote['rate']) {
  const deliveryDays =
    typeof rate.deliveryDays === 'number'
      ? `, ${rate.deliveryDays}d`
      : ''

  return `${rate.carrier} ${rate.service} · ${currencyFormatter.format(rate.rateCents / 100)}${deliveryDays}`
}

function formatRefundStatus(refundStatus?: string) {
  if (!refundStatus) return 'Not requested'
  return humanize(normalizeStatusToken(refundStatus))
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc')
    return <ArrowUp className="size-3" aria-hidden="true" />
  if (direction === 'desc')
    return <ArrowDown className="size-3" aria-hidden="true" />
  return <ArrowUpDown className="size-3 opacity-30" aria-hidden="true" />
}

function LoadingTable() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded border bg-muted/20" />
        ))}
      </div>
      <div className="rounded border bg-card">
        <div className="h-8 border-b bg-muted/10" />
        <div className="space-y-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse bg-muted/5" />
          ))}
        </div>
      </div>
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
  children: import('react').ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
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
function StatsBar({ orders }: { orders: OrderRow[] }) {
  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmountCents, 0)
    const totalItems = orders.reduce((sum, o) => sum + o.itemCount, 0)
    const pendingShipments = orders.filter(
      (o) => o.shippingStatus === 'pending' || o.shippingStatus === 'processing',
    ).length
    const delivered = orders.filter((o) => o.shippingStatus === 'delivered').length
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0

    return { totalRevenue, totalItems, pendingShipments, delivered, avgOrderValue }
  }, [orders])

  const cells = [
    {
      label: 'Total Orders',
      value: orders.length.toLocaleString(),
      icon: ShoppingCart,
    },
    {
      label: 'Revenue',
      value: currencyFormatter.format(stats.totalRevenue / 100),
      icon: DollarSign,
    },
    {
      label: 'Pending Shipments',
      value: stats.pendingShipments.toLocaleString(),
      icon: Truck,
    },
    {
      label: 'Delivered',
      value: stats.delivered.toLocaleString(),
      icon: Package,
    },
    {
      label: 'Total Items',
      value: stats.totalItems.toLocaleString(),
      icon: Tag,
    },
    {
      label: 'Avg Order',
      value: currencyFormatter.format(stats.avgOrderValue / 100),
      icon: DollarSign,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rounded border bg-card px-3 py-2"
        >
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

export function OrdersTable() {
  const orders = useQuery(api.orders.queries.list)
  const previewPurchase = useAction(api.shipments.actions.previewPurchase)
  const purchaseLabel = useAction(api.shipments.actions.purchaseLabel)
  const refundLabel = useAction(api.shipments.actions.refundLabel)
  const setFulfillmentStatus = useMutation(api.orders.mutations.setFulfillmentStatus)
  const [activeFilter, setActiveFilter] = useState<PresetFilter>('all')
  const [isFulfilling, setIsFulfilling] = useState(false)

  const allRows = orders ?? []
  const rows = useMemo(() => {
    const now = Date.now()
    switch (activeFilter) {
      case 'last7':
        return allRows.filter((o) => now - o.createdAt < 7 * 24 * 60 * 60 * 1000)
      case 'last30':
        return allRows.filter((o) => now - o.createdAt < 30 * 24 * 60 * 60 * 1000)
      case 'unfulfilled':
        return allRows.filter((o) => o.fulfillmentStatus !== true)
      case 'not_delivered':
        return allRows.filter((o) => o.shippingStatus !== 'delivered')
      default:
        return allRows
    }
  }, [allRows, activeFilter])

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [purchaseOrder, setPurchaseOrder] = useState<OrderRow | null>(null)
  const [purchaseQuote, setPurchaseQuote] = useState<PurchaseQuote | null>(null)
  const [allowUnverifiedAddress, setAllowUnverifiedAddress] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [managedOrder, setManagedOrder] = useState<OrderRow | null>(null)
  const [managedShipment, setManagedShipment] = useState<OrderRow['latestShipment']>()
  const [refundError, setRefundError] = useState<string | null>(null)
  const [isRefunding, setIsRefunding] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  async function openPurchaseModal(order: OrderRow) {
    setFlashMessage(null)
    setPurchaseOrder(order)
    setPurchaseQuote(null)
    setAllowUnverifiedAddress(false)
    setPurchaseError(null)
    setIsPreviewing(true)

    try {
      const quote = (await previewPurchase({
        orderId: order._id,
      })) as PurchaseQuote
      setPurchaseQuote(quote)
    } catch (error) {
      setPurchaseError(getErrorMessage(error))
    } finally {
      setIsPreviewing(false)
    }
  }

  function closePurchaseModal() {
    setPurchaseOrder(null)
    setPurchaseQuote(null)
    setAllowUnverifiedAddress(false)
    setPurchaseError(null)
    setIsPreviewing(false)
    setIsPurchasing(false)
  }

  function openManageModal(order: OrderRow) {
    setFlashMessage(null)
    setManagedOrder(order)
    setManagedShipment(order.latestShipment)
    setRefundError(null)
  }

  function closeManageModal() {
    setManagedOrder(null)
    setManagedShipment(undefined)
    setRefundError(null)
    setIsRefunding(false)
  }

  async function handlePurchaseSubmit() {
    if (!purchaseOrder || !purchaseQuote) {
      return
    }

    setIsPurchasing(true)
    setPurchaseError(null)

    try {
      const purchased = await purchaseLabel({
        orderId: purchaseOrder._id,
        expectedRateCents: purchaseQuote.rate.rateCents,
        allowUnverifiedAddress,
      })

      setFlashMessage({
        kind: 'success',
        text: `Purchased ${purchaseQuote.rate.carrier} ${purchaseQuote.rate.service} for ${purchaseOrder.orderNumber}.`,
      })
      closePurchaseModal()

      if (typeof purchased.labelUrl === 'string') {
        window.open(purchased.labelUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setPurchaseError(getErrorMessage(error))
    } finally {
      setIsPurchasing(false)
    }
  }

  async function handleRefund() {
    if (!managedOrder || !managedShipment) {
      return
    }

    setIsRefunding(true)
    setRefundError(null)

    try {
      const refund = await refundLabel({
        orderId: managedOrder._id,
        easypostShipmentId: managedShipment.easypostShipmentId,
      })

      const nextRefundStatus = refund.easypostRefundStatus

      setManagedShipment((current) =>
        current
          ? {
              ...current,
              refundStatus: nextRefundStatus,
            }
          : current,
      )
      setFlashMessage({
        kind: 'success',
        text: `Refund ${humanize(nextRefundStatus)} for ${managedOrder.orderNumber}.`,
      })
    } catch (error) {
      setRefundError(getErrorMessage(error))
    } finally {
      setIsRefunding(false)
    }
  }

  async function handleRepurchaseFromManage() {
    if (!managedOrder) {
      return
    }

    closeManageModal()
    await openPurchaseModal(managedOrder)
  }

  const selectedCount = Object.keys(rowSelection).length

  async function handleMarkFulfilled() {
    if (selectedCount === 0) return
    setIsFulfilling(true)
    try {
      await Promise.all(
        Object.keys(rowSelection).map((orderId) =>
          setFulfillmentStatus({ orderId: orderId as any, fulfilled: true }),
        ),
      )
      setFlashMessage({
        kind: 'success',
        text: `Marked ${selectedCount} order${selectedCount === 1 ? '' : 's'} as fulfilled.`,
      })
      setRowSelection({})
    } catch (error) {
      setFlashMessage({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsFulfilling(false)
    }
  }

  const columns = [
    columnHelper.display({
      id: 'select',
      header: ({ table: t }) => (
        <input
          type="checkbox"
          className="size-3 accent-primary"
          checked={t.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = t.getIsSomePageRowsSelected()
          }}
          onChange={t.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="size-3 accent-primary"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    }),
    columnHelper.accessor('orderNumber', {
      header: 'Order',
      cell: (info) => {
        const value = info.getValue()
        const short = value.length > 12 ? value.slice(-12) : value
        const orderUrl = getOrderUrl(info.row.original)

        if (!orderUrl) {
          return (
            <span
              className="font-mono text-[11px] font-medium tracking-wide"
              title={value}
            >
              {short}
            </span>
          )
        }

        return (
          <a
            href={orderUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[11px] font-medium tracking-wide text-primary underline-offset-2 hover:underline"
            title={`${value} (open in ${humanize(info.row.original.channel)})`}
          >
            {short}
          </a>
        )
      },
    }),
    columnHelper.accessor('channel', {
      header: 'Channel',
      cell: (info) => {
        const channel = info.getValue()
        return (
          <span className={cn(
            'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            channelStyles[channel] ?? 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
          )}>
            {humanize(channel)}
          </span>
        )
      },
    }),
    columnHelper.accessor('customerName', {
      header: 'Customer',
      cell: (info) => {
        const value = info.getValue()
        const isDefaulted = normalizeStatusToken(value) === 'unknown'
        const addr = info.row.original.shippingAddress
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'block max-w-44 cursor-default truncate text-xs font-medium',
                  isDefaulted && 'text-amber-500/80',
                )}
              >
                {value}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-64">
              <p className="font-semibold">{addr.name}</p>
              <p className="mt-1 text-muted-foreground">
                {addr.line1}
                {addr.line2 ? `, ${addr.line2}` : ''}
                {addr.line3 ? `, ${addr.line3}` : ''}
                <br />
                {addr.city}, {addr.state} {addr.postalCode}
                <br />
                {addr.country}
              </p>
            </TooltipContent>
          </Tooltip>
        )
      },
    }),
    columnHelper.accessor('shippingStatus', {
      header: 'Status',
      cell: (info) => {
        const shippingStatus = info.getValue()
        const trackingPublicUrl = info.row.original.trackingPublicUrl
        const className = cn(
          'inline-flex w-fit rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          statusStyles[shippingStatus],
        )

        if (!trackingPublicUrl) {
          return (
            <span className={className}>
              {formatShippingStatusLabel(shippingStatus)}
            </span>
          )
        }

        return (
          <a
            href={trackingPublicUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              className,
              'cursor-pointer underline-offset-2 hover:underline',
            )}
            title="Open tracking details"
          >
            {formatShippingStatusLabel(shippingStatus)}
          </a>
        )
      },
    }),
    columnHelper.accessor((row) => row.fulfillmentStatus === true, {
      id: 'fulfillmentStatus',
      header: 'Fulfil',
      cell: (info) => (
        <span
          className={cn(
            'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            info.getValue()
              ? fulfillmentStyles.fulfilled
              : fulfillmentStyles.unfulfilled,
          )}
        >
          {info.getValue() ? 'yes' : 'no'}
        </span>
      ),
    }),
    columnHelper.accessor('shippingMethod', {
      header: 'Method',
      cell: (info) => (
        <span className="text-xs text-muted-foreground">
          {formatShippingMethodLabel(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('itemCount', {
      header: 'Qty',
      cell: (info) => (
        <span className="text-xs tabular-nums">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('totalAmountCents', {
      header: 'Total',
      cell: (info) => (
        <span className="text-xs font-medium tabular-nums">
          {currencyFormatter.format(info.getValue() / 100)}
        </span>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: (info) => (
        <span
          className="text-xs tabular-nums text-muted-foreground"
          title={new Date(info.getValue()).toLocaleString()}
        >
          {dateFormatter.format(new Date(info.getValue()))}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => {
        const order = info.row.original
        const activePurchasedShipment = hasActivePurchasedShipment(order)

        if (activePurchasedShipment) {
          return (
            <div className="flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => openManageModal(order)}
                  >
                    <Truck className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Manage Label</TooltipContent>
              </Tooltip>
            </div>
          )
        }

        return (
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => void openPurchaseModal(order)}
                >
                  <Tag className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Purchase Label</TooltipContent>
            </Tooltip>
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: { sorting, pagination, rowSelection },
  })

  if (!orders) {
    return <LoadingTable />
  }

  if (allRows.length === 0) {
    return (
      <div className="rounded border border-dashed bg-card px-6 py-12 text-center">
        <p className="text-xs font-medium text-foreground">No orders found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Orders will appear here as soon as they are synced.
        </p>
      </div>
    )
  }

  const canRepurchaseManaged = canRepurchaseShipment(managedShipment)

  return (
    <>
      {/* Stats bar */}
      <StatsBar orders={rows} />

      {/* Flash message */}
      {flashMessage ? (
        <div
          className={cn(
            'mt-2 rounded border px-3 py-1.5 text-xs',
            flashMessage.kind === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
              : 'border-red-500/20 bg-red-500/5 text-red-400',
          )}
        >
          {flashMessage.text}
        </div>
      ) : null}

      {/* Orders table */}
      <section className="mt-2 overflow-hidden rounded border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/5 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-foreground">
              Orders
            </h2>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {rows.length}{activeFilter !== 'all' ? ` / ${allRows.length}` : ''} total
            </span>
            {selectedCount > 0 ? (
              <span className="text-[10px] tabular-nums text-primary">
                · {selectedCount} selected
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {([
              ['all', 'All'],
              ['last7', '7d'],
              ['last30', '30d'],
              ['unfulfilled', 'Unfulfilled'],
              ['not_delivered', 'Not Delivered'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                  activeFilter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
                onClick={() => {
                  setActiveFilter(key)
                  setPagination((p) => ({ ...p, pageIndex: 0 }))
                }}
              >
                {label}
              </button>
            ))}
            {selectedCount > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="ml-1 gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => void handleMarkFulfilled()}
                    disabled={isFulfilling}
                  >
                    <CheckCircle2 className="size-3" />
                    {isFulfilling ? 'Updating...' : 'Mark Fulfilled'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Mark {selectedCount} order{selectedCount === 1 ? '' : 's'} as fulfilled</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[1020px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-border/50 hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const isNumeric = numericColumns.has(header.column.id)
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          'h-7 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                          getColumnWidthClass(header.column.id),
                          isNumeric && 'text-right',
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className={cn(
                              'flex w-full items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted/50',
                              isNumeric && 'justify-end',
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span>
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </span>
                            <SortIcon direction={header.column.getIsSorted()} />
                          </button>
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    'border-border/30',
                    rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
                    'hover:bg-muted/20',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isNumeric = numericColumns.has(cell.column.id)
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-2 py-1.5',
                          getColumnWidthClass(cell.column.id),
                          isNumeric && 'text-right tabular-nums',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <footer className="flex items-center justify-between border-t bg-muted/5 px-3 py-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <label
              htmlFor="orders-page-size"
              className="font-medium text-foreground"
            >
              Rows
            </label>
            <select
              id="orders-page-size"
              className="h-6 rounded border bg-background px-1.5 text-[10px] text-foreground"
              value={table.getState().pagination.pageSize}
              onChange={(event) => {
                table.setPageSize(Number(event.target.value))
              }}
            >
              {[10, 20, 50].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}
              -
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                orders.length,
              )}{' '}
              of {rows.length}
            </span>
            <span className="tabular-nums">
              Pg {table.getState().pagination.pageIndex + 1}/{table.getPageCount()}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>

      {/* Purchase Modal */}
      {purchaseOrder ? (
        <Modal
          title={`Purchase Shipping: ${purchaseOrder.orderNumber}`}
          description="Rates are quoted live from EasyPost. Purchase is blocked if the quoted service or price changes before buy."
          onClose={closePurchaseModal}
        >
          <div className="space-y-3">
            {isPreviewing ? (
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded bg-muted/30" />
                <div className="h-20 animate-pulse rounded bg-muted/20" />
                <div className="h-24 animate-pulse rounded bg-muted/15" />
              </div>
            ) : purchaseQuote ? (
              <>
                <div className="grid gap-2 rounded border bg-muted/5 p-3 md:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Method
                    </p>
                    <p className="mt-0.5 text-xs font-medium">
                      {purchaseQuote.shippingMethod}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Package
                    </p>
                    <p className="mt-0.5 text-xs font-medium">
                      {purchaseQuote.predefinedPackage}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Weight
                    </p>
                    <p className="mt-0.5 text-xs font-medium">
                      {purchaseQuote.weightOz} oz
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Quantity
                    </p>
                    <p className="mt-0.5 text-xs font-medium">
                      {purchaseQuote.quantity} cards
                    </p>
                  </div>
                </div>

                <div className="rounded border bg-muted/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Verified destination
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {purchaseQuote.verifiedAddress.street1}
                    {purchaseQuote.verifiedAddress.street2
                      ? `, ${purchaseQuote.verifiedAddress.street2}`
                      : ''}
                    <br />
                    {purchaseQuote.verifiedAddress.city},{' '}
                    {purchaseQuote.verifiedAddress.state}{' '}
                    {purchaseQuote.verifiedAddress.zip}
                    <br />
                    {purchaseQuote.verifiedAddress.country}
                  </p>
                </div>

                {!purchaseQuote.addressVerified ? (
                  <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                    <p className="font-semibold">Address verification warning</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                      {purchaseQuote.verificationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                    <label className="mt-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={allowUnverifiedAddress}
                        onChange={(event) =>
                          setAllowUnverifiedAddress(event.target.checked)
                        }
                      />
                      <span>
                        I have manually verified this address and approve buying
                        postage anyway.
                      </span>
                    </label>
                  </div>
                ) : null}

                <div className="rounded border bg-muted/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Selected service
                  </p>
                  <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                      {formatRateLabel(purchaseQuote.rate)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Derived from shipping method:
                      {' '}
                      {purchaseQuote.shippingMethod} {'->'} {purchaseQuote.service}
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            {purchaseError ? (
              <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
                {purchaseError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closePurchaseModal}
                disabled={isPurchasing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handlePurchaseSubmit()}
                disabled={
                  isPreviewing ||
                  isPurchasing ||
                  !purchaseQuote ||
                  (!purchaseQuote.addressVerified && !allowUnverifiedAddress)
                }
              >
                {isPurchasing ? 'Purchasing...' : 'Buy Label'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Manage Label Modal */}
      {managedOrder && managedShipment ? (
        <Modal
          title={`Manage Label: ${managedOrder.orderNumber}`}
          description="Reprint the current label, request a refund, or start a replacement purchase after the refund is accepted."
          onClose={closeManageModal}
        >
          <div className="space-y-3">
            <div className="grid gap-2 rounded border bg-muted/5 p-3 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Tracking
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {managedShipment.trackingNumber ?? 'Not available'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Refund
                </p>
                <p className="mt-0.5 text-xs font-medium capitalize">
                  {formatRefundStatus(managedShipment.refundStatus)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Carrier
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {managedShipment.carrier ?? 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Service
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {managedShipment.service ?? 'Unknown'}
                </p>
              </div>
            </div>

            {refundError ? (
              <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
                {refundError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              {managedShipment.labelUrl ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={managedShipment.labelUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Printer className="size-3" />
                        Reprint Label
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open label in new tab</TooltipContent>
                </Tooltip>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRefund()}
                disabled={
                  isRefunding || hasRefundedPostage(managedShipment.refundStatus)
                }
              >
                <Undo2 className="size-3" />
                {isRefunding ? 'Refunding...' : 'Refund Label'}
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => void handleRepurchaseFromManage()}
                disabled={!canRepurchaseManaged}
              >
                <RefreshCw className="size-3" />
                Repurchase Label
              </Button>
            </div>

            {!canRepurchaseManaged ? (
              <p className="text-[10px] text-muted-foreground">
                Repurchase stays locked until the existing label refund is
                submitted or completed.
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
