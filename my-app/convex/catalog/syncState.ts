import type { Doc } from '../_generated/dataModel'

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export function latestSourceTimestamp(
  set: Pick<
    Doc<'catalogSets'>,
    'modifiedOn' | 'productsModifiedAt' | 'pricingModifiedAt' | 'skusModifiedAt'
  >,
): number | undefined {
  const timestamps = [
    toTimestamp(set.modifiedOn),
    toTimestamp(set.productsModifiedAt),
    toTimestamp(set.pricingModifiedAt),
    toTimestamp(set.skusModifiedAt),
  ].filter((value): value is number => typeof value === 'number')

  if (timestamps.length === 0) {
    return undefined
  }

  return Math.max(...timestamps)
}

export function getSyncPriority(set: Doc<'catalogSets'>): number {
  if (!set.lastSyncedAt) {
    return set.syncStatus === 'error' ? 3 : 0
  }

  const sourceTimestamp = latestSourceTimestamp(set)
  if (typeof sourceTimestamp === 'number' && sourceTimestamp > set.lastSyncedAt) {
    return 1
  }

  if (set.syncStatus === 'error') {
    return 3
  }

  return 2
}

export function compareSyncCandidates(
  left: Doc<'catalogSets'>,
  right: Doc<'catalogSets'>,
) {
  const leftPriority = getSyncPriority(left)
  const rightPriority = getSyncPriority(right)

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority
  }

  const leftSourceTimestamp = latestSourceTimestamp(left) ?? 0
  const rightSourceTimestamp = latestSourceTimestamp(right) ?? 0
  if (leftPriority === 1 && leftSourceTimestamp !== rightSourceTimestamp) {
    return rightSourceTimestamp - leftSourceTimestamp
  }

  if (leftPriority === 3) {
    return (left.nextSyncAttemptAt ?? 0) - (right.nextSyncAttemptAt ?? 0)
  }

  return (left.lastSyncedAt ?? 0) - (right.lastSyncedAt ?? 0)
}

export function isSyncCandidateEligible(
  set: Doc<'catalogSets'>,
  now: number,
  allowedCategoryIds: Set<number> | null,
) {
  if (set.syncStatus === 'syncing') {
    return false
  }

  if (
    set.syncStatus === 'error' &&
    typeof set.nextSyncAttemptAt === 'number' &&
    set.nextSyncAttemptAt > now
  ) {
    return false
  }

  return (
    allowedCategoryIds === null || allowedCategoryIds.has(set.tcgtrackingCategoryId)
  )
}
