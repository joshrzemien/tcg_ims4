import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { InventoryDashboard } from '../features/inventory/InventoryDashboard'
import { requireBackendAuth } from '~/lib/auth'

export const Route = createFileRoute('/inventory')({
  beforeLoad: async ({ context }) =>
    await requireBackendAuth(context.convexQueryClient),
  component: InventoryPage,
})

function InventoryPage() {
  return (
    <AppShell
      activeNav="inventory"
      pageTitle="Inventory"
      pageDescription="Track singles, sealed product, and graded inventory by physical location."
    >
      <InventoryDashboard />
    </AppShell>
  )
}
