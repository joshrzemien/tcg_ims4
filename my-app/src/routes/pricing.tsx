import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { PricingDashboard } from '../components/PricingDashboard'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
})

function PricingPage() {
  return (
    <AppShell
      activeNav="pricing"
      pageTitle="Pricing tracker"
      pageDescription="Track market prices across TCGPlayer and Manapool. Create rules to monitor sets, categories, or individual cards."
    >
      <PricingDashboard />
    </AppShell>
  )
}
