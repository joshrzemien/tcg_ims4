import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { OrdersTable } from '../features/orders/OrdersTable'
import { requireBackendAuth } from '~/lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) =>
    await requireBackendAuth(context.convexQueryClient),
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
