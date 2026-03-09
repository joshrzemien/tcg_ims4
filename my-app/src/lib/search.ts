export const SEARCH_CONFIGS = {
  picker: {
    minChars: 2,
    debounceMs: 200,
  },
  page: {
    minChars: 1,
    debounceMs: 250,
  },
} as const

export type SearchKind = keyof typeof SEARCH_CONFIGS

export function normalizeSearchInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function isSearchReady(
  value: string,
  kind: SearchKind,
): boolean {
  return normalizeSearchInput(value).length >= SEARCH_CONFIGS[kind].minChars
}
