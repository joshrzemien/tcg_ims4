import { afterEach, vi } from 'vitest'

const originalEnv = { ...process.env }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.env = { ...originalEnv }
})
