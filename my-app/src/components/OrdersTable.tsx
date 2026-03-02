import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useState } from "react";

const columnHelper = createColumnHelper<any>();

const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Order",
    cell: (info) => info.getValue().slice(0, 8) + "…",
  }),
  columnHelper.accessor("channel", { header: "Channel" }),
  columnHelper.accessor("customerName", { header: "Customer" }),
  columnHelper.accessor("status", { header: "Status" }),
  columnHelper.accessor("shippingMethod", {
    header: "Shipping",
    cell: (info) => info.getValue()?.replace("_", " ") ?? "—",
  }),
  columnHelper.accessor("itemCount", { header: "Items" }),
  columnHelper.accessor("totalAmountCents", {
    header: "Total",
    cell: (info) => `$${(info.getValue() / 100).toFixed(2)}`,
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
];

export function OrdersTable() {
  const orders = useQuery(api.orders.queries.list);
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: orders ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  if (!orders) return <div>Loading...</div>;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              return (
                <TableHead key={header.id} onClick={() => table.getColumn(header.id)?.toggleSorting(header.id === sorting[0]?.id ? sorting[0]?.desc : false)}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}