import { describe, expect, it } from 'vitest'

import {
  compareSyncCandidates,
  getSyncPriority,
  isSyncCandidateEligible,
  latestSourceTimestamp,
  needsRuleScopeCleanup,
} from '../../../../convex/catalog/syncState'
import { buildCatalogSet } from '../../../helpers/convexFactories'

describe('convex/catalog/syncState', () => {
  it('picks the latest available source timestamp', () => {
    expect(
      latestSourceTimestamp(
        buildCatalogSet({
          modifiedOn: '2026-03-01T00:00:00.000Z',
          productsModifiedAt: 'invalid',
          pricingModifiedAt: '2026-03-02T00:00:00.000Z',
          skusModifiedAt: '2026-03-03T00:00:00.000Z',
        }),
      ),
    ).toBe(new Date('2026-03-03T00:00:00.000Z').getTime())
  })

  it('assigns sync priorities for unsynced, stale, ready, and errored sets', () => {
    expect(getSyncPriority(buildCatalogSet())).toBe(0)
    expect(
      getSyncPriority(
        buildCatalogSet({
          lastSyncedAt: 10,
          pricingModifiedAt: '1970-01-01T00:00:00.020Z',
        }),
      ),
    ).toBe(1)
    expect(
      getSyncPriority(
        buildCatalogSet({
          lastSyncedAt: 20,
          pricingModifiedAt: '1970-01-01T00:00:00.010Z',
          syncStatus: 'ready',
        }),
      ),
    ).toBe(2)
    expect(
      getSyncPriority(
        buildCatalogSet({
          lastSyncedAt: 20,
          syncStatus: 'error',
        }),
      ),
    ).toBe(3)
  })

  it('compares stale, errored, and fresh sync candidates with the expected sort rules', () => {
    const staleOlder = buildCatalogSet({
      key: 'older',
      lastSyncedAt: 10,
      pricingModifiedAt: '1970-01-01T00:00:00.020Z',
    })
    const staleNewer = buildCatalogSet({
      key: 'newer',
      lastSyncedAt: 10,
      pricingModifiedAt: '1970-01-01T00:00:00.030Z',
    })
    const errorSooner = buildCatalogSet({
      key: 'soon',
      lastSyncedAt: 10,
      syncStatus: 'error',
      nextSyncAttemptAt: 50,
    })
    const errorLater = buildCatalogSet({
      key: 'later',
      lastSyncedAt: 10,
      syncStatus: 'error',
      nextSyncAttemptAt: 100,
    })
    const readyOlder = buildCatalogSet({
      key: 'ready-older',
      lastSyncedAt: 5,
      syncStatus: 'ready',
    })
    const readyNewer = buildCatalogSet({
      key: 'ready-newer',
      lastSyncedAt: 10,
      syncStatus: 'ready',
    })

    expect(compareSyncCandidates(staleOlder, staleNewer)).toBeGreaterThan(0)
    expect(compareSyncCandidates(errorSooner, errorLater)).toBeLessThan(0)
    expect(compareSyncCandidates(readyOlder, readyNewer)).toBeLessThan(0)
  })

  it('computes cleanup and sync eligibility rules', () => {
    expect(needsRuleScopeCleanup(buildCatalogSet())).toBe(false)
    expect(
      needsRuleScopeCleanup(
        buildCatalogSet({
          syncedProductCount: 1,
        }),
      ),
    ).toBe(true)

    expect(
      isSyncCandidateEligible(
        buildCatalogSet({
          syncStatus: 'syncing',
        }),
        100,
        null,
      ),
    ).toBe(false)

    expect(
      isSyncCandidateEligible(
        buildCatalogSet({
          syncStatus: 'error',
          nextSyncAttemptAt: 200,
        }),
        100,
        null,
      ),
    ).toBe(false)

    expect(
      isSyncCandidateEligible(
        buildCatalogSet({
          tcgtrackingCategoryId: 7,
        }),
        100,
        new Set([7]),
      ),
    ).toBe(true)

    expect(
      isSyncCandidateEligible(
        buildCatalogSet({
          tcgtrackingCategoryId: 8,
        }),
        100,
        new Set([7]),
      ),
    ).toBe(false)
  })
})
