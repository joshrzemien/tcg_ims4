import { createFileRoute } from '@tanstack/react-router'
import { OrdersTable } from '../components/OrdersTable'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Orders</h1>
      <OrdersTable />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Live order data from Convex.
      </p>
    </main>
  )
}
