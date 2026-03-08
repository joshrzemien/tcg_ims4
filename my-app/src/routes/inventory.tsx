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
      pageDescription="Track sealed product and singles in your collection."
    >
      <InventoryDashboard />
    </AppShell>
  )
}
