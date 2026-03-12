export const DEFAULT_PRINTER_STATION_KEY = 'default-label-station'
export const DEFAULT_PRINTER_STATION_NAME = 'Default Label Station'
export const PRINTER_STATION_HEARTBEAT_STALE_MS = 30_000
export const PRINT_JOB_RECENT_DEDUPE_WINDOW_MS = 60_000

export const PRINTER_STATION_STATUS_VALUES = [
  'online',
  'offline',
  'unknown',
] as const
export const PRINT_JOB_TYPE_VALUES = [
  'shipping_label',
  'packing_slip',
  'pull_sheet',
  'ad_hoc_document',
] as const
export const PRINT_JOB_STATUS_VALUES = [
  'queued',
  'claimed',
  'printing',
  'printed',
  'failed',
  'cancelled',
] as const
export const PRINT_SOURCE_KIND_VALUES = [
  'remote_url',
  'stored_document',
] as const

export type PrinterStationStatus =
  (typeof PRINTER_STATION_STATUS_VALUES)[number]
export type PrintJobType = (typeof PRINT_JOB_TYPE_VALUES)[number]
export type PrintJobStatus = (typeof PRINT_JOB_STATUS_VALUES)[number]
export type PrintSourceKind = (typeof PRINT_SOURCE_KIND_VALUES)[number]

export function derivePrinterStationStatus(
  station:
    | {
        status?: PrinterStationStatus
        lastHeartbeatAt?: number
      }
    | null
    | undefined,
  now = Date.now(),
): PrinterStationStatus {
  if (!station) {
    return 'unknown'
  }

  if (typeof station.lastHeartbeatAt !== 'number') {
    return station.status ?? 'unknown'
  }

  if (now - station.lastHeartbeatAt > PRINTER_STATION_HEARTBEAT_STALE_MS) {
    return 'offline'
  }

  return station.status ?? 'online'
}
