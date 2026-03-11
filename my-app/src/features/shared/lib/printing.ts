import { humanizeToken } from './text'
import type {
  PrintJobStatus,
  PrinterStationStatus,
} from '../../../../shared/printing'

export function formatPrintJobStatusLabel(status: PrintJobStatus) {
  return humanizeToken(status)
}

export function formatPrinterStationStatusLabel(status: PrinterStationStatus) {
  return humanizeToken(status)
}

export const printJobStatusStyles: Record<PrintJobStatus, string> = {
  queued: 'border-sky-500/20 bg-sky-500/5 text-sky-400',
  claimed: 'border-zinc-500/20 bg-zinc-500/5 text-zinc-300',
  printing: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  printed: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  failed: 'border-red-500/20 bg-red-500/5 text-red-400',
  cancelled: 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
}

export const printerStationStatusStyles: Record<PrinterStationStatus, string> =
  {
    online: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    offline: 'border-red-500/20 bg-red-500/5 text-red-400',
    unknown: 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
  }
