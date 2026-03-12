import {
  formatPrinterStationStatusLabel,
  printerStationStatusStyles,
} from '../lib/printing'
import { formatDateTimeLong } from '../lib/formatting'
import { StatusBadge } from './StatusBadge'
import type { PrinterStationStatus } from '../../../../shared/printing'

export function PrinterStationStatusCard({
  station,
}: {
  station: {
    name: string
    status: PrinterStationStatus
    lastHeartbeatAt?: number
  } | null
}) {
  if (!station) {
    return null
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Printer Station
        </p>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {station.name}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {typeof station.lastHeartbeatAt === 'number' ? (
          <span className="text-[11px] text-muted-foreground">
            Seen {formatDateTimeLong(station.lastHeartbeatAt)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            No heartbeat yet
          </span>
        )}
        <StatusBadge className={printerStationStatusStyles[station.status]}>
          {formatPrinterStationStatusLabel(station.status)}
        </StatusBadge>
      </div>
    </div>
  )
}
