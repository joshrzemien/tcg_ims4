import { createFileRoute } from '@tanstack/react-router'
import { startTransition, useCallback } from 'react'
import { AppShell } from '../components/AppShell'
import { PricingDashboard } from '../features/pricing/PricingDashboard'
import { requireBackendAuth } from '~/lib/auth'
import { normalizeSearchInput } from '~/lib/search'

export type PricingRouteSearch = {
  q?: string
  active?: '1' | '0'
}

export function validatePricingSearch(
  search: Record<string, unknown>,
): PricingRouteSearch {
  const normalizedQuery =
    typeof search.q === 'string' ? normalizeSearchInput(search.q) : ''
  const active =
    search.active === '0' || search.active === '1' ? search.active : undefined

  return {
    ...(normalizedQuery ? { q: normalizedQuery } : {}),
    ...(active ? { active } : {}),
  }
}

export const Route = createFileRoute('/pricing')({
  beforeLoad: async ({ context }) =>
    await requireBackendAuth(context.convexQueryClient),
  validateSearch: validatePricingSearch,
  component: PricingPage,
})

export function PricingPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const committedSeriesSearch = search.q ?? ''
  const activeOnly = search.active !== '0'

  const handleCommittedSeriesSearchChange = useCallback(
    (value: string) => {
      const normalizedValue = normalizeSearchInput(value)
      startTransition(() => {
        void navigate({
          search: (prev) => ({
            ...prev,
            ...(normalizedValue ? { q: normalizedValue } : { q: undefined }),
          }),
          replace: true,
        })
      })
    },
    [navigate],
  )

  const handleActiveOnlyChange = useCallback(
    (nextActiveOnly: boolean) => {
      startTransition(() => {
        void navigate({
          search: (prev) => ({
            ...prev,
            active: nextActiveOnly ? '1' : '0',
          }),
          replace: true,
        })
      })
    },
    [navigate],
  )

  return (
    <AppShell
      activeNav="pricing"
      pageTitle="Pricing tracker"
      pageDescription="Track market prices across TCGPlayer and Manapool. Create rules to monitor sets, categories, or individual cards."
    >
      <PricingDashboard
        committedSeriesSearch={committedSeriesSearch}
        seriesActiveOnly={activeOnly}
        onCommittedSeriesSearchChange={handleCommittedSeriesSearchChange}
        onSeriesActiveOnlyChange={handleActiveOnlyChange}
      />
    </AppShell>
  )
}
