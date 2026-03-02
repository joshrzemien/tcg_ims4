import { createFileRoute } from "@tanstack/react-router"
import { OrdersTable } from "../components/OrdersTable"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">Live order data from Convex.</p>
      </header>

      <OrdersTable />
    </main>
  )
}
