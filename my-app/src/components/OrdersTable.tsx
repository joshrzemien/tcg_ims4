import { useState } from "react"
import type { Doc } from "../../convex/_generated/dataModel"
import { useQuery } from "convex/react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table"
import { api } from "../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { cn } from "~/lib/utils"

type OrderRow = Doc<"orders">

const columnHelper = createColumnHelper<OrderRow>()

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const statusStyles: Record<string, string> = {
  pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  processing:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200",
  shipped:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
  delivered:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  refunded:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  replaced:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200",
}

const numericColumns = new Set(["itemCount", "totalAmountCents", "createdAt"])

function humanize(value: string) {
  return value.replaceAll("_", " ")
}

const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Order",
    cell: (info) => {
      const value = info.getValue()
      const short = value.length > 8 ? `${value.slice(0, 8)}…` : value
      return (
        <span className="font-mono text-xs font-semibold tracking-wide" title={value}>
          {short}
        </span>
      )
    },
  }),
  columnHelper.accessor("channel", {
    header: "Channel",
    cell: (info) => (
      <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
        {humanize(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("customerName", {
    header: "Customer",
    cell: (info) => (
      <span className="block max-w-52 truncate font-medium" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue().toLowerCase()
      return (
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
            statusStyles[status] ??
              "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200"
          )}
        >
          {humanize(status)}
        </span>
      )
    },
  }),
  columnHelper.accessor("shippingMethod", {
    header: "Shipping",
    cell: (info) => humanize(info.getValue() ?? "n/a"),
  }),
  columnHelper.accessor("itemCount", {
    header: "Items",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("totalAmountCents", {
    header: "Total",
    cell: (info) => (
      <span className="font-semibold tabular-nums">
        {currencyFormatter.format(info.getValue() / 100)}
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => (
      <span className="tabular-nums" title={new Date(info.getValue()).toLocaleString()}>
        {dateFormatter.format(new Date(info.getValue()))}
      </span>
    ),
  }),
]

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp className="size-3.5" aria-hidden="true" />
  if (direction === "desc") return <ArrowDown className="size-3.5" aria-hidden="true" />
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

export function OrdersTable() {
  const orders = useQuery(api.orders.queries.list)
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const table = useReactTable({
    data: orders ?? [],
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

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-foreground">Order Queue</h2>
          <p className="text-xs text-muted-foreground">
            {orders.length} {orders.length === 1 ? "order" : "orders"} loaded
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Click a column to sort</p>
      </header>

      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border/70">
                {headerGroup.headers.map((header) => {
                  const isNumeric = numericColumns.has(header.column.id)
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-11 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        isNumeric && "text-right"
                      )}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-muted/70",
                            isNumeric && "justify-end"
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
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
                  "border-border/70",
                  rowIndex % 2 === 0 ? "bg-background" : "bg-muted/15",
                  "hover:bg-muted/40"
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const isNumeric = numericColumns.has(cell.column.id)
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn("px-3 py-3", isNumeric && "text-right tabular-nums")}
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
          <label htmlFor="orders-page-size" className="font-medium text-foreground">
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
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              orders.length
            )}{" "}
            of {orders.length}
          </span>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
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
  )
}
