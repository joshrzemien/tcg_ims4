import { describe, expect, it, vi } from 'vitest'

import {
  dollarsToCents,
  shouldMarkOrderFulfilled,
  toTimestamp,
} from '../../../../../convex/orders/mappers/shared'

describe('convex/orders/mappers/shared', () => {
  it('converts dollars to cents with rounding and null handling', () => {
    expect(dollarsToCents(undefined)).toBe(0)
    expect(dollarsToCents(12.345)).toBe(1235)
  })

  it('uses the current time when no timestamp is provided', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'))

    expect(toTimestamp(undefined)).toBe(Date.now())
    expect(toTimestamp('2026-03-01T00:00:00.000Z')).toBe(
      new Date('2026-03-01T00:00:00.000Z').getTime(),
    )
  })

  it('marks shipped lifecycle states as fulfilled', () => {
    expect(shouldMarkOrderFulfilled('shipped')).toBe(true)
    expect(shouldMarkOrderFulfilled('available_for_pickup')).toBe(true)
    expect(shouldMarkOrderFulfilled('pending')).toBe(false)
  })
})
