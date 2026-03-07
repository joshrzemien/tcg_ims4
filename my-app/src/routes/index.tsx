import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { OrdersTable } from '../components/OrdersTable'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <AppShell
      activeNav="dashboard"
      pageTitle="Orders dashboard"
      pageDescription="Manage marketplace orders, labels, exports, and fulfillment from one view."
    >
      <OrdersTable />
    </AppShell>
  )
}
