import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  CheckCircle2,
  Package,
  Printer,
  Tag,
  Truck,
} from 'lucide-react'
import { formatShippingMethodLabel } from '../../../../shared/shippingMethod'
import { formatShippingStatusLabel, normalizeStatusToken } from '../../../../shared/shippingStatus'
import {
  FILTER_OPTIONS,
  channelStyles,
  columnWidths,
  fulfillmentStyles,
  numericColumns,
  statusStyles,
} from '../constants'
import { getOrderUrl, shouldIgnoreRowSelection } from '../lib/shipment'
import type { RowSelectionState } from '@tanstack/react-table'
import type { OrderRow, PresetFilter } from '../types'
import { Button } from '~/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { formatCents, formatDate } from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'

const columnHelper = createColumnHelper<OrderRow>()

function getColumnWidthClass(columnId: string) {
  return columnWidths[columnId] ?? ''
}

export function OrdersDataTable({
  rows,
  activeFilter,
  rowSelection,
  isFulfilling,
  isExportingPullSheets,
  isExportingPackingSlips,
  isOrdersPageLoading,
  isOnLastPage,
  pageIndex,
  pageSize,
  visibleRangeStart,
  visibleRangeEnd,
  selectedCount,
  selectedTcgplayerCount,
  selectedNonTcgplayerCount,
  onChangeFilter,
  setRowSelection,
  onExportPullSheets,
  onExportPackingSlips,
  onMarkFulfilled,
  onOpenDetail,
  onOpenManage,
  onOpenPurchase,
  onPrevPage,
  onNextPage,
  onUpdatePageSize,
}: {
  rows: Array<OrderRow>
  activeFilter: PresetFilter
  rowSelection: RowSelectionState
  isFulfilling: boolean
  isExportingPullSheets: boolean
  isExportingPackingSlips: boolean
  isOrdersPageLoading: boolean
  isOnLastPage: boolean
  pageIndex: number
  pageSize: number
  visibleRangeStart: number
  visibleRangeEnd: number
  selectedCount: number
  selectedTcgplayerCount: number
  selectedNonTcgplayerCount: number
  onChangeFilter: (filter: PresetFilter) => void
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  onExportPullSheets: () => void
  onExportPackingSlips: () => void
  onMarkFulfilled: () => void
  onOpenDetail: (order: OrderRow) => void
  onOpenManage: (order: OrderRow) => void
  onOpenPurchase: (order: OrderRow) => void
  onPrevPage: () => void
  onNextPage: () => void
  onUpdatePageSize: (pageSize: number) => void
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('orderNumber', {
        header: 'Order',
        cell: (info) => {
          const value = info.getValue()
          const short = value.length > 12 ? value.slice(-12) : value
          const order = info.row.original
          const orderUrl = getOrderUrl(order)
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
                <span className="font-mono text-[11px] font-medium tracking-wide" title={value}>
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
            <span
              className={cn(
                'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                channelStyles[channel] ?? 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
              )}
            >
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
            return <span className={className}>{formatShippingStatusLabel(shippingStatus)}</span>
          }

          return (
            <a
              href={trackingPublicUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(className, 'cursor-pointer underline-offset-2 hover:underline')}
              title="Open tracking details"
            >
              {formatShippingStatusLabel(shippingStatus)}
            </a>
          )
        },
      }),
      columnHelper.accessor((row) => row.isFulfilled, {
        id: 'isFulfilled',
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
        cell: (info) => <span className="text-xs tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.accessor('totalAmountCents', {
        header: 'Total',
        cell: (info) => (
          <span className="text-xs font-medium tabular-nums">{formatCents(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Created',
        cell: (info) => (
          <span
            className="text-xs tabular-nums text-muted-foreground"
            title={new Date(info.getValue()).toLocaleString()}
          >
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => {
          const order = info.row.original
          return (
            <div className="flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-xs" variant="ghost" onClick={() => onOpenDetail(order)}>
                    <Package className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">View Order / Pull</TooltipContent>
              </Tooltip>
              {order.shipmentCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" size="icon-xs" variant="ghost" onClick={() => onOpenManage(order)}>
                      <Truck className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {order.reviewShipmentCount > 0
                      ? `Manage Labels (${order.reviewShipmentCount} need review)`
                      : 'Manage Labels'}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" size="icon-xs" variant="ghost" onClick={() => onOpenPurchase(order)}>
                      <Tag className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Purchase Label</TooltipContent>
                </Tooltip>
              )}
            </div>
          )
        },
      }),
    ],
    [onOpenDetail, onOpenManage, onOpenPurchase],
  )

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    autoResetAll: false,
  })

  const isAllPageRowsSelected = table.getIsAllPageRowsSelected()
  const isSomePageRowsSelected = table.getIsSomePageRowsSelected()

  return (
    <section className="mt-2 overflow-hidden rounded border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/5 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-foreground">Orders</h2>
          <span className="text-[10px] tabular-nums text-muted-foreground">{rows.length} shown</span>
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
          {FILTER_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                activeFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => onChangeFilter(key)}
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
                      onClick={onExportPullSheets}
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
                      onClick={onExportPackingSlips}
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
                  onClick={onMarkFulfilled}
                  disabled={isFulfilling}
                >
                  <CheckCircle2 className="size-3" />
                  {isFulfilling ? 'Updating...' : 'Mark Fulfilled'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Mark {selectedCount} order{selectedCount === 1 ? '' : 's'} as fulfilled
              </TooltipContent>
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
                        <div
                          className={cn(
                            'flex w-full items-center gap-1 px-1 py-0.5',
                            isNumeric && 'justify-end',
                          )}
                        >
                          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        </div>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getAllColumns().length} className="px-6 py-12 text-center">
                  <p className="text-xs font-medium text-foreground">No orders found</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeFilter === 'unfulfilled'
                      ? 'No unfulfilled orders match the current filter.'
                      : 'Orders will appear here as soon as they are synced.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <footer className="flex items-center justify-between border-t bg-muted/5 px-3 py-1.5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <label htmlFor="orders-page-size" className="font-medium text-foreground">
            Rows
          </label>
          <select
            id="orders-page-size"
            className="h-6 rounded border bg-background px-1.5 text-[10px] text-foreground"
            value={pageSize}
            onChange={(event) => onUpdatePageSize(Number(event.target.value))}
          >
            {[10, 20, 50].map((pageSizeOption) => (
              <option key={pageSizeOption} value={pageSizeOption}>
                {pageSizeOption}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {visibleRangeStart}-{visibleRangeEnd}
          </span>
          <span className="tabular-nums">Pg {pageIndex + 1}</span>
          <Button type="button" variant="outline" size="xs" onClick={onPrevPage} disabled={pageIndex === 0}>
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onNextPage}
            disabled={isOrdersPageLoading || isOnLastPage}
          >
            Next
          </Button>
        </div>
      </footer>
    </section>
  )
}
