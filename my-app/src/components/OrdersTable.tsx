import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useAction, useQuery } from 'convex/react'
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, X } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { formatShippingMethodLabel } from '../../shared/shippingMethod'
import {
  formatShippingStatusLabel,
  hasRefundedPostage,
  normalizeStatusToken,
} from '../../shared/shippingStatus'
import type { PaginationState, SortingState } from '@tanstack/react-table'
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
  year: 'numeric',
})

const statusStyles: Record<ShippingStatus, string> = {
  pending:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  processing:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200',
  created:
    'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200',
  purchased:
    'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200',
  pre_transit:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200',
  in_transit:
    'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200',
  out_for_delivery:
    'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200',
  shipped:
    'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200',
  delivered:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
  available_for_pickup:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
  return_to_sender:
    'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200',
  failure:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
  cancelled:
    'border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-500/40 dark:bg-zinc-500/10 dark:text-zinc-200',
  refunded:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
  replaced:
    'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200',
  unknown:
    'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200',
}

const fulfillmentStyles = {
  fulfilled:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
  unfulfilled:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
}

const numericColumns = new Set(['itemCount', 'totalAmountCents', 'createdAt'])
const columnWidths: Partial<Record<string, string>> = {
  orderNumber: 'w-[10rem] min-w-[10rem]',
  channel: 'w-[7rem] min-w-[7rem]',
  customerName: 'w-[14rem] min-w-[14rem]',
  shippingStatus: 'w-[11rem] min-w-[11rem]',
  fulfillmentStatus: 'w-[6rem] min-w-[6rem]',
  shippingMethod: 'w-[7rem] min-w-[7rem]',
  itemCount: 'w-[5rem] min-w-[5rem]',
  totalAmountCents: 'w-[6.5rem] min-w-[6.5rem]',
  createdAt: 'w-[8.5rem] min-w-[8.5rem]',
  actions: 'w-[11rem] min-w-[11rem]',
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
      ? `, ${rate.deliveryDays} day${rate.deliveryDays === 1 ? '' : 's'}`
      : ''

  return `${rate.carrier} ${rate.service} • ${currencyFormatter.format(rate.rateCents / 100)}${deliveryDays}`
}

function formatRefundStatus(refundStatus?: string) {
  if (!refundStatus) return 'Not requested'
  return humanize(normalizeStatusToken(refundStatus))
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc')
    return <ArrowUp className="size-3.5" aria-hidden="true" />
  if (direction === 'desc')
    return <ArrowDown className="size-3.5" aria-hidden="true" />
  return <ArrowUpDown className="size-3.5 opacity-45" aria-hidden="true" />
}

function LoadingTable() {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="h-12 border-b bg-muted/20" />
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
        ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function OrdersTable() {
  const orders = useQuery(api.orders.queries.list)
  const previewPurchase = useAction(api.shipments.actions.previewPurchase)
  const purchaseLabel = useAction(api.shipments.actions.purchaseLabel)
  const refundLabel = useAction(api.shipments.actions.refundLabel)
  const rows = orders ?? []
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
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

  const columns = [
    columnHelper.accessor('orderNumber', {
      header: 'Order',
      cell: (info) => {
        const value = info.getValue()
        const short = value.length > 12 ? `${value.slice(0, 12)}...` : value
        const orderUrl = getOrderUrl(info.row.original)

        if (!orderUrl) {
          return (
            <span
              className="font-mono text-xs font-semibold tracking-wide"
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
            className="font-mono text-xs font-semibold tracking-wide text-primary underline-offset-2 hover:underline"
            title={`${value} (open in ${humanize(info.row.original.channel)})`}
          >
            {short}
          </a>
        )
      },
    }),
    columnHelper.accessor('channel', {
      header: 'Channel',
      cell: (info) => (
        <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
          {humanize(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('customerName', {
      header: 'Customer',
      cell: (info) => {
        const value = info.getValue()
        const isDefaulted = normalizeStatusToken(value) === 'unknown'
        return (
          <span
            className={cn(
              'block max-w-52 truncate font-medium',
              isDefaulted && 'text-amber-700 dark:text-amber-300',
            )}
            title={value}
          >
            {value}
          </span>
        )
      },
    }),
    columnHelper.accessor('shippingStatus', {
      header: 'Shipping Status',
      cell: (info) => {
        const shippingStatus = info.getValue()
        const trackingPublicUrl = info.row.original.trackingPublicUrl
        const className = cn(
          'inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold',
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
      header: 'Fulfilled',
      cell: (info) => (
        <span
          className={cn(
            'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
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
      header: 'Shipping Method',
      cell: (info) => <span>{formatShippingMethodLabel(info.getValue())}</span>,
    }),
    columnHelper.accessor('itemCount', {
      header: 'Items',
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    }),
    columnHelper.accessor('totalAmountCents', {
      header: 'Total',
      cell: (info) => (
        <span className="font-semibold tabular-nums">
          {currencyFormatter.format(info.getValue() / 100)}
        </span>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: (info) => (
        <span
          className="tabular-nums"
          title={new Date(info.getValue()).toLocaleString()}
        >
          {dateFormatter.format(new Date(info.getValue()))}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const order = info.row.original
        const activePurchasedShipment = hasActivePurchasedShipment(order)

        return (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant={activePurchasedShipment ? 'outline' : 'default'}
              onClick={() =>
                activePurchasedShipment
                  ? openManageModal(order)
                  : void openPurchaseModal(order)
              }
            >
              {activePurchasedShipment ? 'Manage Label' : 'Purchase'}
            </Button>
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: { sorting, pagination },
  })

  if (!orders) {
    return <LoadingTable />
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">No orders found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders will appear here as soon as they are synced.
        </p>
      </div>
    )
  }

  const canRepurchaseManaged = canRepurchaseShipment(managedShipment)

  return (
    <>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <header className="space-y-3 border-b bg-muted/20 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-foreground">
              Orders
            </h2>
            <p className="text-xs text-muted-foreground">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'} loaded
            </p>
          </div>
          {flashMessage ? (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                flashMessage.kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200',
              )}
            >
              {flashMessage.text}
            </div>
          ) : null}
        </header>

        <div className="overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-border/70">
                  {headerGroup.headers.map((header) => {
                    const isNumeric = numericColumns.has(header.column.id)
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          'h-11 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                          getColumnWidthClass(header.column.id),
                          isNumeric && 'text-right',
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className={cn(
                              'flex w-full items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-muted/70',
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
                    'border-border/70',
                    rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/15',
                    'hover:bg-muted/40',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isNumeric = numericColumns.has(cell.column.id)
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 py-3',
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

        <footer className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label
              htmlFor="orders-page-size"
              className="font-medium text-foreground"
            >
              Rows per page
            </label>
            <select
              id="orders-page-size"
              className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
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
            <span>
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}
              -
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                orders.length,
              )}{' '}
              of {orders.length}
            </span>
            <span>
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>

      {purchaseOrder ? (
        <Modal
          title={`Purchase Shipping: ${purchaseOrder.orderNumber}`}
          description="Rates are quoted live from EasyPost. Purchase is blocked if the quoted service or price changes before buy."
          onClose={closePurchaseModal}
        >
          <div className="space-y-4">
            {isPreviewing ? (
              <div className="space-y-3">
                <div className="h-12 animate-pulse rounded-lg bg-muted/50" />
                <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
                <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
              </div>
            ) : purchaseQuote ? (
              <>
                <div className="grid gap-3 rounded-xl border bg-muted/10 p-4 md:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Method
                    </p>
                    <p className="mt-1 font-medium">
                      {purchaseQuote.shippingMethod}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Package
                    </p>
                    <p className="mt-1 font-medium">
                      {purchaseQuote.predefinedPackage}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Weight
                    </p>
                    <p className="mt-1 font-medium">
                      {purchaseQuote.weightOz} oz
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Quantity
                    </p>
                    <p className="mt-1 font-medium">
                      {purchaseQuote.quantity} cards
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Verified destination
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
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
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    <p className="font-semibold">Address verification warning</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {purchaseQuote.verificationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                    <label className="mt-3 flex items-start gap-2">
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

                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Selected service
                  </p>
                  <div className="mt-3 rounded-lg border border-primary bg-primary/10 px-3 py-3">
                    <p className="font-medium text-foreground">
                      {formatRateLabel(purchaseQuote.rate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Derived automatically from shipping method:
                      {' '}
                      {purchaseQuote.shippingMethod} {'->'} {purchaseQuote.service}
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            {purchaseError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {purchaseError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closePurchaseModal}
                disabled={isPurchasing}
              >
                Cancel
              </Button>
              <Button
                type="button"
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

      {managedOrder && managedShipment ? (
        <Modal
          title={`Manage Label: ${managedOrder.orderNumber}`}
          description="Reprint the current label, request a refund, or start a replacement purchase after the refund is accepted."
          onClose={closeManageModal}
        >
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border bg-muted/10 p-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tracking
                </p>
                <p className="mt-1 font-medium">
                  {managedShipment.trackingNumber ?? 'Not available'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Refund
                </p>
                <p className="mt-1 font-medium capitalize">
                  {formatRefundStatus(managedShipment.refundStatus)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Carrier
                </p>
                <p className="mt-1 font-medium">
                  {managedShipment.carrier ?? 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Service
                </p>
                <p className="mt-1 font-medium">
                  {managedShipment.service ?? 'Unknown'}
                </p>
              </div>
            </div>

            {refundError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {refundError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {managedShipment.labelUrl ? (
                <Button type="button" variant="outline" asChild>
                  <a
                    href={managedShipment.labelUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Reprint Label
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRefund()}
                disabled={
                  isRefunding || hasRefundedPostage(managedShipment.refundStatus)
                }
              >
                {isRefunding ? 'Refunding...' : 'Refund Label'}
              </Button>

              <Button
                type="button"
                onClick={() => void handleRepurchaseFromManage()}
                disabled={!canRepurchaseManaged}
              >
                Repurchase Label
              </Button>
            </div>

            {!canRepurchaseManaged ? (
              <p className="text-sm text-muted-foreground">
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
