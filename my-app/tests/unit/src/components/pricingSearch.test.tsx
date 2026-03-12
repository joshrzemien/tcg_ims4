// @vitest-environment jsdom

import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesTab } from '../../../../src/features/pricing/PricingDashboard'
import { TooltipProvider } from '../../../../src/components/ui/tooltip'
import {
  PricingPage,
  Route,
  validatePricingSearch,
} from '../../../../src/routes/pricing'
import type { ReactNode } from 'react'

const {
  useQueryMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: (...args: Array<unknown>) => useQueryMock(...args),
}))

vi.mock('../../../../src/components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const seriesRow = {
  _id: 'series-1',
  key: 'series-1',
  catalogProductKey: 'product-1',
  categoryKey: 'magic',
  setKey: 'lea',
  searchText: 'black lotus normal product-1',
  name: 'Black Lotus',
  number: '233',
  rarity: 'Rare',
  printingKey: 'normal',
  printingLabel: 'Normal',
  skuVariantCode: 'N',
  pricingSource: 'sku',
  preferredCatalogSkuKey: 'sku-1',
  preferredTcgplayerSku: 1,
  currentTcgMarketPriceCents: 100,
  currentTcgLowPriceCents: 90,
  currentTcgHighPriceCents: 110,
  currentListingCount: 1,
  currentManapoolPriceCents: 95,
  currentManapoolQuantity: 2,
  lastSnapshotFingerprint: 'fingerprint',
  lastSnapshotAt: 123,
  lastResolvedAt: 123,
  activeRuleCount: 1,
  active: true,
  updatedAt: 123,
}

function latestSeriesQueryArgs() {
  const seriesCalls = useQueryMock.mock.calls.filter(
    ([, args]) =>
      typeof args === 'object' &&
      args !== null &&
      'paginationOpts' in args &&
      'activeOnly' in args,
  )

  return seriesCalls[seriesCalls.length - 1]?.[1] as
    | {
        search?: string
        paginationOpts: {
          cursor: string | null
          numItems: number
        }
      }
    | undefined
}

describe('pricing search components', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    useQueryMock.mockReset()
    useQueryMock.mockImplementation((_queryRef: unknown, args: unknown) => {
      if (
        typeof args === 'object' &&
        args !== null &&
        'paginationOpts' in args &&
        'activeOnly' in args
      ) {
        return {
          page: [seriesRow],
          continueCursor: 'next-cursor',
          isDone: false,
        }
      }

      if (args === undefined) {
        return {
          totalTrackedSeries: 1,
          totalActiveTrackedSeries: 1,
          totalRules: 1,
          totalActiveRules: 1,
          totalIssues: 0,
          totalActiveIssues: 0,
        }
      }

      return undefined
    })
  })

  function renderWithTooltip(children: ReactNode) {
    return render(<TooltipProvider>{children}</TooltipProvider>)
  }

  it('debounces page search commits', () => {
    const onCommittedSearchChange = vi.fn()

    renderWithTooltip(
      <SeriesTab
        committedSearch=""
        activeOnly={true}
        onCommittedSearchChange={onCommittedSearchChange}
        onActiveOnlyChange={vi.fn()}
      />,
    )

    const input = screen.getByPlaceholderText(
      'Search by name, printing, or product key...',
    )

    fireEvent.change(input, { target: { value: 'Lo' } })
    fireEvent.change(input, { target: { value: 'Lot' } })
    fireEvent.change(input, { target: { value: 'Lotus' } })

    act(() => {
      vi.advanceTimersByTime(249)
    })

    expect(onCommittedSearchChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(onCommittedSearchChange).toHaveBeenCalledTimes(1)
    expect(onCommittedSearchChange).toHaveBeenCalledWith('Lotus')
  })

  it('keeps the current page cursor until the debounced term commits', () => {
    function Harness() {
      const [committedSearch, setCommittedSearch] = useState('')

      return (
        <SeriesTab
          committedSearch={committedSearch}
          activeOnly={true}
          onCommittedSearchChange={setCommittedSearch}
          onActiveOnlyChange={vi.fn()}
        />
      )
    }

    renderWithTooltip(<Harness />)

    fireEvent.click(screen.getByText('Load More'))

    expect(latestSeriesQueryArgs()?.paginationOpts.cursor).toBe('next-cursor')

    fireEvent.change(
      screen.getByPlaceholderText('Search by name, printing, or product key...'),
      { target: { value: 'Lotus' } },
    )

    expect(latestSeriesQueryArgs()?.paginationOpts.cursor).toBe('next-cursor')

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(latestSeriesQueryArgs()).toEqual(
      expect.objectContaining({
        search: 'Lotus',
        paginationOpts: expect.objectContaining({
          cursor: null,
        }),
      }),
    )
  })

  it('normalizes pricing route search and restores the series input from URL state', () => {
    expect(
      validatePricingSearch({
        q: '  Black   Lotus  ',
        active: '1',
      }),
    ).toEqual({
      q: 'Black Lotus',
      active: '1',
    })

    const navigateSpy = vi.fn()
    vi.spyOn(Route, 'useSearch').mockReturnValue({
      q: 'Black Lotus',
      active: '1',
    })
    vi.spyOn(Route, 'useNavigate').mockReturnValue(navigateSpy)

    renderWithTooltip(<PricingPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Tracked Series' }),
    )

    const input = screen.getByPlaceholderText(
      'Search by name, printing, or product key...',
    )

    expect(input).toHaveProperty('value', 'Black Lotus')

    fireEvent.change(input, { target: { value: 'Black Lotus Alpha' } })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(navigateSpy).toHaveBeenCalledTimes(1)
    const navigateArgs = navigateSpy.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }

    expect(
      navigateArgs.search({
        q: 'Black Lotus',
        active: '1',
      }),
    ).toEqual({
      q: 'Black Lotus Alpha',
      active: '1',
    })
  })
})
