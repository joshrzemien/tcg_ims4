import { describe, expect, it } from 'vitest'

import {
  SEARCH_CONFIGS,
  isSearchReady,
  normalizeSearchInput,
} from '../../../../src/lib/search'

describe('src/lib/search', () => {
  it('trims input and collapses repeated whitespace', () => {
    expect(normalizeSearchInput('   Black   Lotus  ')).toBe('Black Lotus')
  })

  it('treats whitespace-only input as empty', () => {
    expect(normalizeSearchInput('   \n\t  ')).toBe('')
  })

  it('uses per-search-kind readiness thresholds', () => {
    expect(isSearchReady('a', 'picker')).toBe(false)
    expect(isSearchReady('ab', 'picker')).toBe(true)
    expect(isSearchReady('a', 'page')).toBe(true)
  })

  it('exposes the configured debounce timings', () => {
    expect(SEARCH_CONFIGS.picker.debounceMs).toBe(200)
    expect(SEARCH_CONFIGS.page.debounceMs).toBe(250)
  })
})
