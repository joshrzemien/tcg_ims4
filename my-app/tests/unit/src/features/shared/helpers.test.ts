import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../../../../../src/features/shared/lib/errors'
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatDateTimeLong,
  relativeTime,
} from '../../../../../src/features/shared/lib/formatting'
import { humanizeToken } from '../../../../../src/features/shared/lib/text'

describe('shared formatting helpers', () => {
  it('formats cents with a fallback', () => {
    expect(formatCents(12_345)).toBe('$123.45')
    expect(formatCents(undefined)).toBe('--')
  })

  it('formats dates with fallbacks', () => {
    const timestamp = Date.UTC(2026, 2, 10, 15, 30)

    expect(formatDate(timestamp)).toMatch(/Mar/)
    expect(formatDateTime(timestamp)).toMatch(/Mar/)
    expect(formatDateTimeLong(timestamp)).toMatch(/2026/)
    expect(formatDate(undefined)).toBe('--')
  })

  it('formats relative times', () => {
    const now = Date.now()

    expect(relativeTime(now - 30_000)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000)).toBe('5m ago')
    expect(relativeTime(undefined)).toBe('never')
  })
})

describe('shared text helpers', () => {
  it('humanizes underscore-delimited values', () => {
    expect(humanizeToken('sync_error')).toBe('sync error')
  })

  it('normalizes unknown errors to a safe message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
    expect(getErrorMessage('nope')).toBe('Unknown error')
  })
})
