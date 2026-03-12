import { useEffect, useState } from 'react'
import type { SearchKind } from '~/lib/search'
import {
  SEARCH_CONFIGS,
  isSearchReady,
  normalizeSearchInput,
} from '~/lib/search'

export type SearchControllerOptions = {
  kind: SearchKind
  initialValue?: string
}

export type SearchUiState = {
  isIdle: boolean
  isTooShort: boolean
  isReady: boolean
}

export function useSearchController({
  kind,
  initialValue = '',
}: SearchControllerOptions) {
  const normalizedInitialValue = normalizeSearchInput(initialValue)
  const [rawValue, setRawValue] = useState(normalizedInitialValue)
  const [committedValue, setCommittedValue] = useState(() =>
    isSearchReady(normalizedInitialValue, kind) ? normalizedInitialValue : '',
  )

  useEffect(() => {
    setRawValue(normalizedInitialValue)
    setCommittedValue(
      isSearchReady(normalizedInitialValue, kind) ? normalizedInitialValue : '',
    )
  }, [kind, normalizedInitialValue])

  const normalizedValue = normalizeSearchInput(rawValue)
  const isReady = isSearchReady(normalizedValue, kind)
  const isIdle = normalizedValue.length === 0
  const isTooShort = !isIdle && !isReady

  useEffect(() => {
    if (!isReady) {
      setCommittedValue('')
      return
    }

    const timer = globalThis.setTimeout(() => {
      setCommittedValue(normalizedValue)
    }, SEARCH_CONFIGS[kind].debounceMs)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [isReady, kind, normalizedValue])

  function clear() {
    setRawValue('')
    setCommittedValue('')
  }

  const uiState: SearchUiState = {
    isIdle,
    isTooShort,
    isReady,
  }

  return {
    rawValue,
    setRawValue,
    normalizedValue,
    committedValue,
    clear,
    ...uiState,
  }
}
