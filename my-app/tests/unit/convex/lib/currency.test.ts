import { describe, expect, it } from 'vitest'
import { dollarsToCents } from '../../../../convex/lib/currency'

describe('dollarsToCents', () => {
  it('rounds dollar values to cents', () => {
    expect(dollarsToCents(10.235)).toBe(1024)
  })

  it('treats nullish values as zero', () => {
    expect(dollarsToCents(undefined)).toBe(0)
    expect(dollarsToCents(null)).toBe(0)
  })
})
