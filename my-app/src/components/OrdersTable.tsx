import { useMemo, useState } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useQuery } from "convex/react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { PaginationState, SortingState } from "@tanstack/react-table"
import type { Doc } from "../../convex/_generated/dataModel"
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

interface NormalizedValue {
  raw: string
  canonical: string
  label: string
  changed: boolean
}

type CoverageTone = "clean" | "warning" | "critical"

interface OrderAuditRow extends OrderRow {
  shippingStatusAudit: NormalizedValue
  fulfillmentStatus: boolean
  shippingAudit: NormalizedValue
  coverageIssues: Array<string>
  coverageTone: CoverageTone
}

const columnHelper = createColumnHelper<OrderAuditRow>()

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const canonicalStatuses = new Set([
  "pending",
  "processing",
  "created",
  "purchased",
  "pre_transit",
  "in_transit",
  "out_for_delivery",
  "shipped",
  "delivered",
  "available_for_pickup",
  "return_to_sender",
  "failure",
  "error",
  "cancelled",
  "refunded",
  "replaced",
])

const statusAliases: Record<string, string> = {
  pull_queue: "processing",
  pulling: "processing",
  ready_for_pickup: "processing",
  ready_to_ship: "processing",
  readytoship: "processing",
  received: "processing",
  transit: "in_transit",
  label_created: "created",
}

const shippingAliases: Record<string, string> = {
  firstclass: "first_class",
  first_class_mail: "first_class",
  groundadvantage: "ground_advantage",
  usps_first_class: "first_class",
  usps_ground_advantage: "ground_advantage",
}

const shippingLabels: Record<string, string> = {
  first_class: "USPS First Class",
  ground_advantage: "USPS Ground Advantage",
  priority: "USPS Priority",
  priority_mail: "USPS Priority Mail",
  unknown: "Unknown",
}

const statusStyles: Record<string, string> = {
  pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  processing:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200",
  created:
    "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200",
  purchased:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  pre_transit:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200",
  in_transit:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
  out_for_delivery:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200",
  shipped:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
  delivered:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  available_for_pickup:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  return_to_sender:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200",
  failure:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  error:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  cancelled:
    "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-500/40 dark:bg-zinc-500/10 dark:text-zinc-200",
  refunded:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  replaced:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200",
  unknown:
    "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200",
}

const coverageStyles: Record<CoverageTone, string> = {
  clean:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  critical:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
}

const numericColumns = new Set(["itemCount", "totalAmountCents", "createdAt"])

function normalizeToken(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return "unknown"
  return normalized.replaceAll("-", "_").replaceAll(" ", "_")
}

function humanize(value: string) {
  return value.replaceAll("_", " ")
}

function normalizeShippingStatusAudit(rawStatus: string): NormalizedValue {
  const normalizedRaw = normalizeToken(rawStatus)
  const canonical = statusAliases[normalizedRaw] ?? normalizedRaw
  const resolved = canonicalStatuses.has(canonical) ? canonical : "unknown"

  return {
    raw: normalizedRaw,
    canonical: resolved,
    label: humanize(resolved),
    changed: normalizedRaw !== resolved,
  }
}

function normalizeShippingMethod(rawMethod: string): NormalizedValue {
  const normalizedRaw = normalizeToken(rawMethod)
  const canonical = shippingAliases[normalizedRaw] ?? normalizedRaw
  const label = shippingLabels[canonical] ?? humanize(canonical)

  return {
    raw: normalizedRaw,
    canonical,
    label,
    changed: normalizedRaw !== canonical,
  }
}

function getCoverageIssues(
  order: OrderRow,
  shippingStatusAudit: NormalizedValue,
  shippingAudit: NormalizedValue
): Array<string> {
  const issues: Array<string> = []

  if (order.customerName.trim() === "" || normalizeToken(order.customerName) === "unknown") {
    issues.push("customer name missing/defaulted")
  }

  if (!order.shippingAddress.line1.trim()) issues.push("shipping line1 missing")
  if (!order.shippingAddress.city.trim()) issues.push("shipping city missing")
  if (!order.shippingAddress.state.trim()) issues.push("shipping state missing")
  if (!order.shippingAddress.postalCode.trim()) issues.push("shipping postal code missing")
  if (!order.shippingAddress.country.trim()) issues.push("shipping country missing")

  if (order.itemCount === 0 || order.items.length === 0) {
    issues.push("no line items")
  }

  if (order.itemCount !== order.items.length) {
    issues.push("itemCount does not match items.length")
  }

  if (order.items.some((item) => item.productId.trim() === "")) {
    issues.push("item productId missing")
  }

  if (order.items.some((item) => item.name.trim() === "" || normalizeToken(item.name) === "unknown")) {
    issues.push("item name missing/defaulted")
  }

  if (shippingStatusAudit.canonical === "unknown") {
    issues.push(`shipping status not recognized (${shippingStatusAudit.raw})`)
  }

  if (shippingAudit.canonical === "unknown") {
    issues.push("shipping method unknown")
  }

  return issues
}

function getCoverageTone(issueCount: number): CoverageTone {
  if (issueCount === 0) return "clean"
  if (issueCount <= 2) return "warning"
  return "critical"
}

function toAuditRow(order: OrderRow): OrderAuditRow {
  const shippingStatusAudit = normalizeShippingStatusAudit(order.shippingStatus ?? "pending")
  const shippingAudit = normalizeShippingMethod(order.shippingMethod)
  const coverageIssues = getCoverageIssues(order, shippingStatusAudit, shippingAudit)

  return {
    ...order,
    shippingStatusAudit,
    fulfillmentStatus: order.fulfillmentStatus === true,
    shippingAudit,
    coverageIssues,
    coverageTone: getCoverageTone(coverageIssues.length),
  }
}

function listNormalizationCandidates(
  rows: Array<OrderAuditRow>,
  pick: (row: OrderAuditRow) => NormalizedValue
): Array<{ raw: string; canonical: string; count: number }> {
  const byPair = new Map<string, { raw: string; canonical: string; count: number }>()

  for (const row of rows) {
    const value = pick(row)
    if (!value.changed) continue
    const key = `${value.raw}|${value.canonical}`
    const existing = byPair.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    byPair.set(key, { raw: value.raw, canonical: value.canonical, count: 1 })
  }

  return Array.from(byPair.values()).sort((a, b) => b.count - a.count)
}

function getOrderUrl(order: OrderAuditRow) {
  const encodedOrderNumber = encodeURIComponent(order.orderNumber)
  if (order.channel === "tcgplayer") {
    return `https://sellerportal.tcgplayer.com/orders/${encodedOrderNumber}`
  }
  if (order.channel === "manapool") {
    return `https://manapool.com/seller/orders/${encodedOrderNumber}`
  }
  return null
}

const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Order",
    cell: (info) => {
      const value = info.getValue()
      const short = value.length > 8 ? `${value.slice(0, 8)}...` : value
      const orderUrl = getOrderUrl(info.row.original)

      if (!orderUrl) {
        return (
          <span className="font-mono text-xs font-semibold tracking-wide" title={value}>
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
    cell: (info) => {
      const value = info.getValue()
      const isDefaulted = normalizeToken(value) === "unknown"
      return (
        <span
          className={cn(
            "block max-w-52 truncate font-medium",
            isDefaulted && "text-amber-700 dark:text-amber-300"
          )}
          title={value}
        >
          {value}
        </span>
      )
    },
  }),
  columnHelper.accessor((row) => row.shippingStatusAudit.canonical, {
    id: "shippingStatus",
    header: "Shipping Status",
    cell: (info) => {
      const { shippingStatusAudit } = info.row.original
      return (
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              "inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
              statusStyles[shippingStatusAudit.canonical] ?? statusStyles.unknown
            )}
          >
            {shippingStatusAudit.label}
          </span>
          {shippingStatusAudit.changed && (
            <span className="text-[11px] text-muted-foreground">
              raw: {humanize(shippingStatusAudit.raw)}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("fulfillmentStatus", {
    header: "Fulfilled",
    cell: (info) => (
      <span
        className={cn(
          "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
          info.getValue() ? coverageStyles.clean : coverageStyles.warning
        )}
      >
        {info.getValue() ? "yes" : "no"}
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.shippingAudit.canonical, {
    id: "shippingMethod",
    header: "Shipping Method",
    cell: (info) => {
      const { shippingAudit } = info.row.original
      return (
        <div className="flex flex-col gap-1">
          <span>{shippingAudit.label}</span>
          {shippingAudit.changed && (
            <span className="text-[11px] text-muted-foreground">raw: {humanize(shippingAudit.raw)}</span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor((row) => row.coverageIssues.length, {
    id: "coverage",
    header: "Coverage",
    cell: (info) => {
      const { coverageIssues, coverageTone } = info.row.original
      if (coverageIssues.length === 0) {
        return (
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
              coverageStyles.clean
            )}
          >
            clean
          </span>
        )
      }

      return (
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
            coverageStyles[coverageTone]
          )}
          title={coverageIssues.join(" | ")}
        >
          {coverageIssues.length} issue{coverageIssues.length === 1 ? "" : "s"}
        </span>
      )
    },
  }),
  columnHelper.accessor("itemCount", {
    header: "Items",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("totalAmountCents", {
    header: "Total",
    cell: (info) => (
      <span className="font-semibold tabular-nums">{currencyFormatter.format(info.getValue() / 100)}</span>
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
  const rows = useMemo(() => (orders ?? []).map(toAuditRow), [orders])
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const coverageCount = rows.filter((row) => row.coverageIssues.length > 0).length
  const normalizedShippingStatusCount = rows.filter((row) => row.shippingStatusAudit.changed).length
  const normalizedShippingCount = rows.filter((row) => row.shippingAudit.changed).length
  const shippingStatusCandidates = useMemo(
    () => listNormalizationCandidates(rows, (row) => row.shippingStatusAudit),
    [rows]
  )
  const shippingCandidates = useMemo(
    () => listNormalizationCandidates(rows, (row) => row.shippingAudit),
    [rows]
  )

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

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-foreground">Order Coverage View</h2>
          <p className="text-xs text-muted-foreground">
            {orders.length} {orders.length === 1 ? "order" : "orders"} loaded
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-muted-foreground">
            {coverageCount} with issues
          </span>
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-muted-foreground">
            {normalizedShippingStatusCount} shipping status normalized
          </span>
          <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-muted-foreground">
            {normalizedShippingCount} shipping normalized
          </span>
        </div>
      </header>

      {(shippingStatusCandidates.length > 0 || shippingCandidates.length > 0) && (
        <div className="grid gap-2 border-b bg-background px-4 py-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium text-foreground">Shipping status rename candidates</p>
            {shippingStatusCandidates.slice(0, 4).map((candidate) => (
              <p key={`shipping-status-${candidate.raw}-${candidate.canonical}`}>
                {humanize(candidate.raw)} -&gt; {humanize(candidate.canonical)} ({candidate.count})
              </p>
            ))}
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Shipping rename candidates</p>
            {shippingCandidates.slice(0, 4).map((candidate) => (
              <p key={`shipping-${candidate.raw}-${candidate.canonical}`}>
                {humanize(candidate.raw)} -&gt; {humanize(candidate.canonical)} ({candidate.count})
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="min-w-[1050px]">
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
                    <TableCell key={cell.id} className={cn("px-3 py-3", isNumeric && "text-right tabular-nums")}>
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
