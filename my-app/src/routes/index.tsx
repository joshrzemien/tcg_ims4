import { createFileRoute } from "@tanstack/react-router"
import { Package } from "lucide-react"
import { OrdersTable } from "../components/OrdersTable"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-10 max-w-[1600px] items-center gap-3 px-4">
          <Package className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            TCG Order Management
          </h1>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Dashboard</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-3">
        <OrdersTable />
      </main>
    </div>
  )
}
