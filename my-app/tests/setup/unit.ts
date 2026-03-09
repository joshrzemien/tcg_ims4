import { afterEach, vi } from 'vitest'

const originalEnv = { ...process.env }
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.env = { ...originalEnv }
})
