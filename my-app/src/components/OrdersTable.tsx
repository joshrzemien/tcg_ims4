import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useAction, useQuery } from 'convex/react'
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
  normalizeShippingStatus,
  normalizeStatusToken,
} from '../../shared/shippingStatus'
import { isNonRefundableEasyPostLetterShipment } from '../../shared/shippingRefund'
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table'
import type { ReactNode } from 'react'
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
  shipmentCount: number
  reviewShipmentCount: number
  activeShipment?: {
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
    trackerPublicUrl?: string
    createdAt?: number
    updatedAt?: number
  }
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
    trackerPublicUrl?: string
    createdAt?: number
    updatedAt?: number
  }
}

type ManagedShipment = Doc<'shipments'>

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

type PurchaseResult = {
  labelUrl?: string
}

type FulfillmentResult = {
  warning?: string
}

type ExportDocumentResult = {
  base64Data: string
  fileName: string
  mimeType: string
  orderCount: number
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

const rowSelectionIgnoreSelector = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[data-row-selection-ignore="true"]',
].join(', ')

function shouldIgnoreRowSelection(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest(rowSelectionIgnoreSelector) !== null
    : false
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function normalizeBase64DocumentData(base64Data: string): {
  normalizedBase64Data: string
  mimeType?: string
} {
  let normalizedBase64Data = base64Data.trim()
  let mimeType: string | undefined

  const dataUrlMatch = normalizedBase64Data.match(
    /^data:([^;,]+)?;base64,([\s\S]+)$/i,
  )
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1]
    normalizedBase64Data = dataUrlMatch[2]
  }

  normalizedBase64Data = normalizedBase64Data
    .replace(/\s+/g, '')
    .replaceAll('-', '+')
    .replaceAll('_', '/')

  const paddingRemainder = normalizedBase64Data.length % 4
  if (paddingRemainder === 1) {
    throw new Error('TCGplayer returned an invalid document encoding.')
  }
  if (paddingRemainder > 1) {
    normalizedBase64Data = normalizedBase64Data.padEnd(
      normalizedBase64Data.length + (4 - paddingRemainder),
      '=',
    )
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(normalizedBase64Data)) {
    throw new Error('TCGplayer returned a document in an unexpected format.')
  }

  return { normalizedBase64Data, mimeType }
}

function decodeBase64Document(base64Data: string, mimeType: string): Blob {
  const normalized = normalizeBase64DocumentData(base64Data)
  const binary = window.atob(normalized.normalizedBase64Data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: normalized.mimeType ?? mimeType })
}

function downloadDocument(result: ExportDocumentResult) {
  const blob = decodeBase64Document(result.base64Data, result.mimeType)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = result.fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}

function shipmentHasPurchasedLabel(shipment?: {
  trackingNumber?: string
  labelUrl?: string
  easypostTrackerId?: string
}) {
  return Boolean(
    shipment?.trackingNumber || shipment?.labelUrl || shipment?.easypostTrackerId,
  )
}

function canRepurchaseShipment(shipment?: OrderRow['activeShipment']) {
  return !shipment || hasRefundedPostage(shipment.refundStatus)
}

function canRefundShipment(shipment?: {
  trackingNumber?: string
  labelUrl?: string
  easypostTrackerId?: string
  refundStatus?: string
  trackingStatus?: string
  carrier?: string
  service?: string
  shippingMethod?: string
}) {
  return (
    shipmentHasPurchasedLabel(shipment) &&
    !hasRefundedPostage(shipment?.refundStatus) &&
    normalizeShippingStatus(shipment?.trackingStatus) === 'unknown' &&
    !isNonRefundableEasyPostLetterShipment(shipment)
  )
}

function shipmentReviewLabel(
  shipment: Pick<
    ManagedShipment,
    '_id' | 'refundStatus' | 'trackingStatus' | 'status'
  >,
  activeShipmentId?: ManagedShipment['_id'],
) {
  if (shipment._id === activeShipmentId) return 'Active'
  if (hasRefundedPostage(shipment.refundStatus)) return 'Refunded'
  if (
    normalizeShippingStatus(shipment.trackingStatus ?? shipment.status) ===
    'delivered'
  ) {
    return 'Delivered'
  }
  if (normalizeShippingStatus(shipment.trackingStatus) !== 'unknown') {
    return 'Tracked'
  }
  return 'Needs Review'
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
  children: ReactNode
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
function StatsBar({ orders }: { orders: Array<OrderRow> }) {
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
  const exportPullSheets = useAction(api.orders.actions.exportPullSheets)
  const exportPackingSlips = useAction(api.orders.actions.exportPackingSlips)
  const previewPurchase = useAction(api.shipments.actions.previewPurchase)
  const purchaseLabel = useAction(api.shipments.actions.purchaseLabel)
  const refundLabel = useAction(api.shipments.actions.refundLabel)
  const setFulfillmentStatus = useAction(api.shipments.actions.setFulfillmentStatus)
  const [activeFilter, setActiveFilter] = useState<PresetFilter>('all')
  const [isFulfilling, setIsFulfilling] = useState(false)
  const [isExportingPullSheets, setIsExportingPullSheets] = useState(false)
  const [isExportingPackingSlips, setIsExportingPackingSlips] = useState(false)

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
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundingShipmentId, setRefundingShipmentId] = useState<
    Doc<'shipments'>['_id'] | null
  >(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const currentManagedOrder = managedOrder
    ? allRows.find((order) => order._id === managedOrder._id) ?? managedOrder
    : null
  const managedOrderShipments = useQuery(
    api.shipments.queries.getByOrderId,
    currentManagedOrder ? { orderId: currentManagedOrder._id } : 'skip',
  )
  const sortedManagedShipments = useMemo(
    () =>
      [...(managedOrderShipments ?? [])].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt
        }
        return right.updatedAt - left.updatedAt
      }),
    [managedOrderShipments],
  )

  const selectedOrders = useMemo(
    () => allRows.filter((order) => rowSelection[order._id] === true),
    [allRows, rowSelection],
  )
  const selectedCount = selectedOrders.length
  const selectedTcgplayerCount = selectedOrders.filter(
    (order) => order.channel === 'tcgplayer',
  ).length
  const selectedNonTcgplayerCount = selectedCount - selectedTcgplayerCount

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
    setRefundError(null)
  }

  function closeManageModal() {
    setManagedOrder(null)
    setRefundError(null)
    setRefundingShipmentId(null)
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
      }) as PurchaseResult

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

  async function handleRefund(shipment: ManagedShipment) {
    if (!currentManagedOrder) {
      return
    }

    setRefundingShipmentId(shipment._id)
    setRefundError(null)

    try {
      const refund = await refundLabel({
        orderId: currentManagedOrder._id,
        easypostShipmentId: shipment.easypostShipmentId,
      })

      const nextRefundStatus = refund.easypostRefundStatus
      setFlashMessage({
        kind: 'success',
        text: `Refund ${humanize(nextRefundStatus)} for ${currentManagedOrder.orderNumber} (${shipment.easypostShipmentId}).`,
      })
    } catch (error) {
      setRefundError(getErrorMessage(error))
    } finally {
      setRefundingShipmentId(null)
    }
  }

  async function handleRepurchaseFromManage() {
    if (!currentManagedOrder) {
      return
    }

    closeManageModal()
    await openPurchaseModal(currentManagedOrder)
  }

  async function handleMarkFulfilled() {
    if (selectedCount === 0) return
    setIsFulfilling(true)
    try {
      const results = (await Promise.all(
        Object.keys(rowSelection).map((orderId) =>
          setFulfillmentStatus({ orderId: orderId as any, fulfilled: true }),
        ),
      )) as Array<FulfillmentResult>
      const warnings = results
        .map((result) => result.warning)
        .filter((warning): warning is string => typeof warning === 'string')
      setFlashMessage({
        kind: 'success',
        text: `Marked ${selectedCount} order${selectedCount === 1 ? '' : 's'} as fulfilled.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`,
      })
      setRowSelection({})
    } catch (error) {
      setFlashMessage({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsFulfilling(false)
    }
  }

  function getTimezoneOffsetHours() {
    return -new Date().getTimezoneOffset() / 60
  }

  async function handleExportSelectedDocuments(
    exportKind: 'pull sheets' | 'packing slips',
  ) {
    if (selectedCount === 0) {
      return
    }

    const action =
      exportKind === 'pull sheets' ? exportPullSheets : exportPackingSlips
    const setLoading =
      exportKind === 'pull sheets'
        ? setIsExportingPullSheets
        : setIsExportingPackingSlips

    setLoading(true)
    setFlashMessage(null)

    try {
      const result = (await action({
        orderIds: selectedOrders.map((order) => order._id),
        timezoneOffset: getTimezoneOffsetHours(),
      })) as ExportDocumentResult

      downloadDocument(result)
      setFlashMessage({
        kind: 'success',
        text: `Exported ${exportKind} for ${result.orderCount} TCGplayer order${result.orderCount === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      setFlashMessage({
        kind: 'error',
        text: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    columnHelper.accessor('orderNumber', {
      header: 'Order',
      cell: (info) => {
        const value = info.getValue()
        const short = value.length > 12 ? value.slice(-12) : value
        const order = info.row.original
        const orderUrl = getOrderUrl(info.row.original)
        const badges =
          order.shipmentCount > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {order.shipmentCount} label{order.shipmentCount === 1 ? '' : 's'}
              </span>
              {order.reviewShipmentCount > 0 ? (
                <span className="inline-flex rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {order.reviewShipmentCount} review
                </span>
              ) : null}
            </div>
          ) : null

        return (
          <div className="min-w-0">
            {orderUrl ? (
              <a
                href={orderUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[11px] font-medium tracking-wide text-primary underline-offset-2 hover:underline"
                title={`${value} (open in ${humanize(order.channel)})`}
              >
                {short}
              </a>
            ) : (
              <span
                className="font-mono text-[11px] font-medium tracking-wide"
                title={value}
              >
                {short}
              </span>
            )}
            {badges}
          </div>
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
        if (order.shipmentCount > 0) {
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
                <TooltipContent side="left">
                  {order.reviewShipmentCount > 0
                    ? `Manage Labels (${order.reviewShipmentCount} need review)`
                    : 'Manage Labels'}
                </TooltipContent>
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

  const isAllPageRowsSelected = table.getIsAllPageRowsSelected()
  const isSomePageRowsSelected = table.getIsSomePageRowsSelected()

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

  const canRepurchaseManaged = canRepurchaseShipment(
    currentManagedOrder?.activeShipment,
  )

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
            <span
              className={cn(
                'text-[10px] tabular-nums',
                selectedCount > 0 ? 'text-primary' : 'text-muted-foreground/70',
              )}
            >
              · {selectedCount} selected
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className={cn(
                'ml-1 gap-1 border-border/70 bg-background/80',
                isAllPageRowsSelected
                  ? 'border-primary/30 bg-primary/8 text-foreground hover:bg-primary/12'
                  : isSomePageRowsSelected
                    ? 'border-primary/20 text-foreground hover:bg-primary/8'
                    : '',
              )}
              onClick={() => table.toggleAllPageRowsSelected(!isAllPageRowsSelected)}
            >
              <CheckCircle2 className="size-3" />
              {isAllPageRowsSelected ? 'Deselect Page' : 'Select Page'}
            </Button>
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
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="ml-1 gap-1"
                        onClick={() => void handleExportSelectedDocuments('pull sheets')}
                        disabled={
                          isExportingPullSheets ||
                          isExportingPackingSlips ||
                          selectedTcgplayerCount === 0
                        }
                      >
                        <Printer className="size-3" />
                        {isExportingPullSheets ? 'Exporting...' : 'Pull Sheets'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {selectedNonTcgplayerCount > 0
                      ? `Export pull sheets for ${selectedTcgplayerCount} TCGplayer order${selectedTcgplayerCount === 1 ? '' : 's'}; ${selectedNonTcgplayerCount} non-TCGplayer selection${selectedNonTcgplayerCount === 1 ? '' : 's'} will be ignored`
                      : `Export pull sheets for ${selectedTcgplayerCount} TCGplayer order${selectedTcgplayerCount === 1 ? '' : 's'}`}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="gap-1"
                        onClick={() => void handleExportSelectedDocuments('packing slips')}
                        disabled={
                          isExportingPackingSlips ||
                          isExportingPullSheets ||
                          selectedTcgplayerCount === 0
                        }
                      >
                        <Printer className="size-3" />
                        {isExportingPackingSlips ? 'Exporting...' : 'Packing Slips'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {selectedNonTcgplayerCount > 0
                      ? `Export packing slips for ${selectedTcgplayerCount} TCGplayer order${selectedTcgplayerCount === 1 ? '' : 's'}; ${selectedNonTcgplayerCount} non-TCGplayer selection${selectedNonTcgplayerCount === 1 ? '' : 's'} will be ignored`
                      : `Export packing slips for ${selectedTcgplayerCount} TCGplayer order${selectedTcgplayerCount === 1 ? '' : 's'}`}
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
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
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  aria-selected={row.getIsSelected()}
                  className={cn(
                    'border-border/30 cursor-pointer',
                    rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
                    row.getIsSelected()
                      ? 'bg-primary/6 outline outline-1 -outline-offset-1 outline-primary/25 hover:bg-primary/10'
                      : 'hover:bg-muted/20',
                  )}
                  onClick={(event) => {
                    if (shouldIgnoreRowSelection(event.target)) {
                      return
                    }

                    row.toggleSelected()
                  }}
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
      {currentManagedOrder ? (
        <Modal
          title={`Manage Labels: ${currentManagedOrder.orderNumber}`}
          description="Review the full shipment history for this order, refund unused labels, or start a replacement purchase after the active label is refunded."
          onClose={closeManageModal}
        >
          <div className="space-y-3">
            <div className="grid gap-2 rounded border bg-muted/5 p-3 md:grid-cols-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Active Label
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {currentManagedOrder.activeShipment?.trackingNumber ??
                    'Not available'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {formatShippingStatusLabel(currentManagedOrder.shippingStatus)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Labels
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {currentManagedOrder.shipmentCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Need Review
                </p>
                <p className="mt-0.5 text-xs font-medium">
                  {currentManagedOrder.reviewShipmentCount}
                </p>
              </div>
            </div>

            {refundError ? (
              <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
                {refundError}
              </div>
            ) : null}

            {sortedManagedShipments.length === 0 ? (
              <div className="rounded border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                No shipment history for this order yet.
              </div>
            ) : (
              sortedManagedShipments.map((shipment) => {
                const shipmentStatus = normalizeShippingStatus(
                  shipment.trackingStatus ?? shipment.status,
                )
                const isRefunding = refundingShipmentId === shipment._id
                const canRefund = canRefundShipment(shipment)
                const reviewLabel = shipmentReviewLabel(
                  shipment,
                  currentManagedOrder.activeShipment?._id,
                )

                return (
                  <div
                    key={shipment._id}
                    className="rounded border bg-muted/5 p-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                              statusStyles[shipmentStatus],
                            )}
                          >
                            {formatShippingStatusLabel(shipmentStatus)}
                          </span>
                          <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {reviewLabel}
                          </span>
                          <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {shipment.easypostShipmentId}
                          </span>
                        </div>

                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                              Purchased
                            </p>
                            <p className="mt-0.5 text-foreground">
                              {dateFormatter.format(new Date(shipment.createdAt))}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                              Tracking
                            </p>
                            <p className="mt-0.5 font-mono text-foreground">
                              {shipment.trackingNumber ?? 'Not available'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                              Refund
                            </p>
                            <p className="mt-0.5 text-foreground">
                              {formatRefundStatus(shipment.refundStatus)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                              Service
                            </p>
                            <p className="mt-0.5 text-foreground">
                              {shipment.carrier && shipment.service
                                ? `${shipment.carrier} ${shipment.service}`
                                : 'Unknown'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {shipment.trackerPublicUrl ? (
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a
                              href={shipment.trackerPublicUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <Truck className="size-3" />
                              Track
                              <ExternalLink className="size-3" />
                            </a>
                          </Button>
                        ) : null}
                        {shipment.labelUrl ? (
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a
                              href={shipment.labelUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <Printer className="size-3" />
                              Reprint
                              <ExternalLink className="size-3" />
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRefund(shipment)}
                          disabled={!canRefund || isRefunding}
                        >
                          <Undo2 className="size-3" />
                          {isRefunding ? 'Refunding...' : 'Refund'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
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
                Repurchase stays locked until the active label refund is
                submitted or completed.
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
