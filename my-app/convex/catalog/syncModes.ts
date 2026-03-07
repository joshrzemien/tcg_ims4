export type SetSyncMode = 'full' | 'pricing_only'

export function rankSyncMode(mode: SetSyncMode): number {
  return mode === 'full' ? 2 : 1
}

export function pickHigherPrioritySyncMode(
  left: SetSyncMode | undefined,
  right: SetSyncMode,
): SetSyncMode {
  if (!left) {
    return right
  }

  return rankSyncMode(left) >= rankSyncMode(right) ? left : right
}
