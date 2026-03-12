import { describe, expect, it } from 'vitest'
import { derivePrinterStationStatus } from '../../../../shared/printing'

describe('shared printing status helpers', () => {
  it('returns unknown when no station is configured yet', () => {
    expect(derivePrinterStationStatus(undefined)).toBe('unknown')
  })

  it('returns online when the heartbeat is recent', () => {
    expect(
      derivePrinterStationStatus(
        {
          status: 'online',
          lastHeartbeatAt: 1_000,
        },
        20_000,
      ),
    ).toBe('online')
  })

  it('returns offline when the station heartbeat is stale', () => {
    expect(
      derivePrinterStationStatus(
        {
          status: 'online',
          lastHeartbeatAt: 1_000,
        },
        40_000,
      ),
    ).toBe('offline')
  })
})
