// @vitest-environment jsdom

import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemFormFields } from '../../../../src/components/InventoryDashboard'
import { CreateRuleModal } from '../../../../src/components/PricingDashboard'

const {
  useQueryMock,
  useMutationMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useAction: () => vi.fn(),
  useMutation: (...args: Array<unknown>) => useMutationMock(...args),
  useQuery: (...args: Array<unknown>) => useQueryMock(...args),
}))

describe('picker search components', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    useQueryMock.mockReset()
    useMutationMock.mockReset()
    useMutationMock.mockImplementation(() => vi.fn())
    useQueryMock.mockImplementation((_queryRef: unknown, args: unknown) => {
      if (args === 'skip') {
        return undefined
      }

      if (
        typeof args === 'object' &&
        args !== null &&
        'limit' in args &&
        'search' in args &&
        (args as { limit: number }).limit === 10
      ) {
        const search = (args as { search: string }).search
        return search === 'Black Lotus'
          ? [
              {
                _id: 'product-1',
                key: 'product-1',
                cleanName: 'Black Lotus',
                name: 'Black Lotus',
                setKey: 'lea',
              },
            ]
          : []
      }

      if (
        typeof args === 'object' &&
        args !== null &&
        'limit' in args &&
        'search' in args &&
        (args as { limit: number }).limit === 25
      ) {
        const search = (args as { search: string }).search
        return search === 'Alpha'
          ? [
              {
                key: 'lea',
                label: 'Magic: The Gathering / Limited Edition Alpha',
                name: 'Limited Edition Alpha',
                categoryKey: 'magic',
                categoryDisplayName: 'Magic: The Gathering',
                productCount: 295,
                skuCount: 300,
                pricingSyncStatus: 'idle',
                syncStatus: 'ready',
                syncedProductCount: 295,
                syncedSkuCount: 300,
              },
            ]
          : []
      }

      return undefined
    })
  })

  it('does not query picker product search until 2 normalized characters and clears cleanly', () => {
    render(
      <ItemFormFields
        selectedProductKey=""
        selectedProductName=""
        onSelectProduct={vi.fn()}
        onClearProduct={vi.fn()}
        quantity="1"
        onQuantityChange={vi.fn()}
        location=""
        onLocationChange={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
      />,
    )

    const input = screen.getByPlaceholderText('Search by product name...')

    expect(screen.getByText('Type at least 2 characters.')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'B' } })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(
      useQueryMock.mock.calls.filter(
        ([, args]) =>
          typeof args === 'object' &&
          args !== null &&
          'limit' in args &&
          (args as { limit: number }).limit === 10,
      ),
    ).toHaveLength(0)

    fireEvent.change(input, { target: { value: '  Black   Lotus  ' } })
    act(() => {
      vi.advanceTimersByTime(199)
    })

    expect(
      useQueryMock.mock.calls.filter(
        ([, args]) =>
          typeof args === 'object' &&
          args !== null &&
          'limit' in args &&
          (args as { limit: number }).limit === 10,
      ),
    ).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(
      useQueryMock.mock.calls.some(
        ([, args]) =>
          typeof args === 'object' &&
          args !== null &&
          'limit' in args &&
          (args as { limit: number }).limit === 10 &&
          (args as { search: string }).search === 'Black Lotus',
      ),
    ).toBe(true)
    expect(screen.getByText('Black Lotus')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Clear search'))

    expect(screen.queryByText('Black Lotus')).toBeNull()
    expect(screen.getByText('Type at least 2 characters.')).toBeTruthy()
  })

  it('keeps set picker idle on open and only searches after 2 characters', () => {
    render(<CreateRuleModal onClose={vi.fn()} onFlash={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search sets...')

    expect(screen.getByText('Type at least 2 characters.')).toBeTruthy()
    expect(
      useQueryMock.mock.calls.some(
        ([, args]) =>
          typeof args === 'object' &&
          args !== null &&
          'limit' in args &&
          (args as { limit: number }).limit === 25,
      ),
    ).toBe(false)

    fireEvent.change(input, { target: { value: 'A' } })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(
      useQueryMock.mock.calls.some(
        ([, args]) =>
          typeof args === 'object' &&
          args !== null &&
          'limit' in args &&
          (args as { limit: number }).limit === 25,
      ),
    ).toBe(false)

    fireEvent.change(input, { target: { value: 'Alpha' } })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(
      useQueryMock.mock.calls.some(
        ([, args]) =>
          typeof args === 'object' &&
          args !== null &&
          'limit' in args &&
          (args as { limit: number }).limit === 25 &&
          (args as { search: string }).search === 'Alpha',
      ),
    ).toBe(true)
    expect(screen.getByText('Magic: The Gathering / Limited Edition Alpha')).toBeTruthy()
  })
})
