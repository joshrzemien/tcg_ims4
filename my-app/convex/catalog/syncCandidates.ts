import type { Doc } from '../_generated/dataModel'
import { needsRuleScopeCleanup } from './syncState'

type SyncCandidateCtx = {
  db: any
}

type CatalogSetDoc = Doc<'catalogSets'>

const CANDIDATE_OVERFETCH_MULTIPLIER = 8

function clampCandidateTake(limit: number) {
  return Math.max(1, Math.min(limit * CANDIDATE_OVERFETCH_MULTIPLIER, 400))
}

function isAllowedCategory(
  set: CatalogSetDoc,
  allowedCategoryIds: Set<number> | null,
) {
  return (
    allowedCategoryIds === null ||
    allowedCategoryIds.has(set.tcgtrackingCategoryId)
  )
}

function isNotProcessing(set: CatalogSetDoc) {
  return set.syncStatus !== 'syncing' && set.pricingSyncStatus !== 'syncing'
}

function isDueErrorRetry(set: CatalogSetDoc, now: number) {
  return (
    set.syncStatus === 'error' &&
    (typeof set.nextSyncAttemptAt !== 'number' || set.nextSyncAttemptAt <= now)
  )
}

function appendUniqueCandidates(
  target: Array<CatalogSetDoc>,
  source: Array<CatalogSetDoc>,
  seenSetKeys: Set<string>,
  limit: number,
) {
  for (const candidate of source) {
    if (seenSetKeys.has(candidate.key)) {
      continue
    }

    seenSetKeys.add(candidate.key)
    target.push(candidate)

    if (target.length >= limit) {
      break
    }
  }
}

export async function loadSyncCandidates(
  ctx: SyncCandidateCtx,
  {
    limit,
    allowedCategoryIds,
    now,
  }: {
    limit: number
    allowedCategoryIds: Set<number> | null
    now: number
  },
): Promise<Array<CatalogSetDoc>> {
  const take = clampCandidateTake(limit)
  const [
    cleanupBase,
    unsyncedCandidates,
    sourceChangedCandidates,
    routineCandidates,
    errorCandidates,
  ] = await Promise.all([
    ctx.db
      .query('catalogSets')
      .withIndex('by_inRuleScope_isSynced_lastSyncedAt', (q: any) =>
        q.eq('inRuleScope', false).eq('hasCompletedSync', true),
      )
      .order('desc')
      .take(take),
    ctx.db
      .query('catalogSets')
      .withIndex('by_inRuleScope_isSynced_lastSyncedAt', (q: any) =>
        q.eq('inRuleScope', true).eq('hasCompletedSync', false),
      )
      .take(take),
    ctx.db
      .query('catalogSets')
      .withIndex('by_inRuleScope_hasSourceChanges_latestSourceUpdatedAt', (
        q: any,
      ) => q.eq('inRuleScope', true).eq('hasSourceChanges', true))
      .order('desc')
      .take(take),
    ctx.db
      .query('catalogSets')
      .withIndex('by_inRuleScope_isSynced_lastSyncedAt', (q: any) =>
        q.eq('inRuleScope', true).eq('hasCompletedSync', true),
      )
      .order('asc')
      .take(take),
    ctx.db
      .query('catalogSets')
      .withIndex('by_inRuleScope_syncStatus_nextSyncAttemptAt', (q: any) =>
        q.eq('inRuleScope', true).eq('syncStatus', 'error'),
      )
      .take(take),
  ])

  const cleanupCandidates = cleanupBase.filter(
    (set: CatalogSetDoc) => isNotProcessing(set) && needsRuleScopeCleanup(set),
  )
  const inScopeUnsynced = unsyncedCandidates.filter(
    (set: CatalogSetDoc) =>
      isNotProcessing(set) && isAllowedCategory(set, allowedCategoryIds),
  )
  const inScopeSourceChanged = sourceChangedCandidates.filter(
    (set: CatalogSetDoc) =>
      isNotProcessing(set) && isAllowedCategory(set, allowedCategoryIds),
  )
  const inScopeRoutine = routineCandidates.filter(
    (set: CatalogSetDoc) =>
      isNotProcessing(set) &&
      isAllowedCategory(set, allowedCategoryIds) &&
      set.syncStatus !== 'error' &&
      !set.hasSourceChanges,
  )
  const inScopeErrors = errorCandidates.filter(
    (set: CatalogSetDoc) =>
      isNotProcessing(set) &&
      isAllowedCategory(set, allowedCategoryIds) &&
      isDueErrorRetry(set, now),
  )

  const ordered: Array<CatalogSetDoc> = []
  const seenSetKeys = new Set<string>()

  appendUniqueCandidates(ordered, cleanupCandidates, seenSetKeys, limit)
  appendUniqueCandidates(ordered, inScopeUnsynced, seenSetKeys, limit)
  appendUniqueCandidates(ordered, inScopeSourceChanged, seenSetKeys, limit)
  appendUniqueCandidates(ordered, inScopeRoutine, seenSetKeys, limit)
  appendUniqueCandidates(ordered, inScopeErrors, seenSetKeys, limit)

  return ordered
}
