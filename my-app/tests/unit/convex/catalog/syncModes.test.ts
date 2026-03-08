import { describe, expect, it } from 'vitest'

import {
  pickHigherPrioritySyncMode,
  rankSyncMode,
} from '../../../../convex/catalog/syncModes'

describe('convex/catalog/syncModes', () => {
  it('ranks full sync above pricing-only sync', () => {
    expect(rankSyncMode('pricing_only')).toBe(1)
    expect(rankSyncMode('full')).toBe(2)
  })

  it('keeps the higher-priority sync mode when combining requests', () => {
    expect(pickHigherPrioritySyncMode(undefined, 'pricing_only')).toBe(
      'pricing_only',
    )
    expect(pickHigherPrioritySyncMode('pricing_only', 'full')).toBe('full')
    expect(pickHigherPrioritySyncMode('full', 'pricing_only')).toBe('full')
  })
})
