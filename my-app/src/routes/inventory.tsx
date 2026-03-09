import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { InventoryDashboard } from '../components/InventoryDashboard'

export const Route = createFileRoute('/inventory')({
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
