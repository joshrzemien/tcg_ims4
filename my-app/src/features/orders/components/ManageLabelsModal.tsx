import { ExternalLink, Printer, RefreshCw, Truck, Undo2 } from 'lucide-react'
import { statusStyles } from '../constants'
import {
  canRefundShipment,
  formatRefundStatus,
  shipmentReviewLabel,
} from '../lib/shipment'
import {
  formatShippingStatusLabel,
  normalizeShippingStatus,
} from '../../../../shared/shippingStatus'
import type {
  ManagedShipment,
  OrderRow,
  PrintJobSummary,
  PrinterStationSummary,
} from '../types'
import {
  formatPrintJobStatusLabel,
  formatPrinterStationStatusLabel,
  printJobStatusStyles,
  printerStationStatusStyles,
} from '~/features/shared/lib/printing'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { StatusBadge } from '~/features/shared/components/StatusBadge'
import { formatDate } from '~/features/shared/lib/formatting'
import { cn } from '~/lib/utils'

export function ManageLabelsModal({
  order,
  shipments,
  latestPrintJobsByShipmentId,
  queueingShipmentId,
  refundError,
  refundingShipmentId,
  canRepurchase,
  printerStation,
  onClose,
  onQueueReprint,
  onRefund,
  onRepurchase,
}: {
  order: OrderRow
  shipments: Array<ManagedShipment>
  latestPrintJobsByShipmentId: Map<ManagedShipment['_id'], PrintJobSummary>
  queueingShipmentId: ManagedShipment['_id'] | null
  refundError: string | null
  refundingShipmentId: ManagedShipment['_id'] | null
  canRepurchase: boolean
  printerStation: PrinterStationSummary | null
  onClose: () => void
  onQueueReprint: (shipment: ManagedShipment) => void
  onRefund: (shipment: ManagedShipment) => void
  onRepurchase: () => void
}) {
  return (
    <DialogShell
      title={`Manage Labels: ${order.orderNumber}`}
      description="Review the full shipment history for this order, refund unused labels, or start a replacement purchase after the active label is refunded."
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="grid gap-2 rounded border bg-muted/5 p-3 md:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Active Label
            </p>
            <p className="mt-0.5 text-xs font-medium">
              {order.activeShipment?.trackingNumber ?? 'Not available'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <p className="mt-0.5 text-xs font-medium">
              {formatShippingStatusLabel(order.shippingStatus)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Labels
            </p>
            <p className="mt-0.5 text-xs font-medium">{order.shipmentCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Printer
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <p className="text-xs font-medium">
                {printerStation?.name ?? 'Default station'}
              </p>
              {printerStation ? (
                <StatusBadge
                  className={printerStationStatusStyles[printerStation.status]}
                >
                  {formatPrinterStationStatusLabel(printerStation.status)}
                </StatusBadge>
              ) : null}
            </div>
          </div>
        </div>

        {refundError ? (
          <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
            {refundError}
          </div>
        ) : null}

        {shipments.length === 0 ? (
          <div className="rounded border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            No shipment history for this order yet.
          </div>
        ) : (
          shipments.map((shipment) => {
            const shipmentStatus = normalizeShippingStatus(
              shipment.trackingStatus ?? shipment.status,
            )
            const isRefunding = refundingShipmentId === shipment._id
            const isQueueingReprint = queueingShipmentId === shipment._id
            const canRefund = canRefundShipment(shipment)
            const reviewLabel = shipmentReviewLabel(
              shipment,
              order.activeShipment?._id,
            )
            const latestPrintJob = latestPrintJobsByShipmentId.get(shipment._id)

            return (
              <div key={shipment._id} className="rounded border bg-muted/5 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          statusStyles[shipmentStatus],
                        )}
                      >
                        {formatShippingStatusLabel(shipmentStatus)}
                      </span>
                      <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {reviewLabel}
                      </span>
                      <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {shipment.easypostShipmentId}
                      </span>
                    </div>

                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          Purchased
                        </p>
                        <p className="mt-0.5 text-foreground">
                          {formatDate(shipment.createdAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          Tracking
                        </p>
                        <p className="mt-0.5 font-mono text-foreground">
                          {shipment.trackingNumber ?? 'Not available'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          Refund
                        </p>
                        <p className="mt-0.5 text-foreground">
                          {formatRefundStatus(shipment.refundStatus)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          Service
                        </p>
                        <p className="mt-0.5 text-foreground">
                          {shipment.carrier && shipment.service
                            ? `${shipment.carrier} ${shipment.service}`
                            : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          Print
                        </p>
                        {latestPrintJob ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <StatusBadge
                              className={
                                printJobStatusStyles[latestPrintJob.status]
                              }
                            >
                              {formatPrintJobStatusLabel(latestPrintJob.status)}
                            </StatusBadge>
                            {latestPrintJob.failureMessage ? (
                              <span className="text-[11px] text-red-400">
                                {latestPrintJob.failureMessage}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-foreground">Not queued</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {shipment.trackerPublicUrl ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a
                          href={shipment.trackerPublicUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <Truck className="size-3" />
                          Track
                          <ExternalLink className="size-3" />
                        </a>
                      </Button>
                    ) : null}
                    {shipment.labelUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onQueueReprint(shipment)}
                        disabled={isQueueingReprint}
                      >
                        <Printer className="size-3" />
                        {isQueueingReprint ? 'Queueing...' : 'Queue Reprint'}
                      </Button>
                    ) : null}
                    {shipment.labelUrl ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a
                          href={shipment.labelUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <Printer className="size-3" />
                          Open Label
                          <ExternalLink className="size-3" />
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRefund(shipment)}
                      disabled={!canRefund || isRefunding}
                    >
                      <Undo2 className="size-3" />
                      {isRefunding ? 'Refunding...' : 'Refund'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            onClick={onRepurchase}
            disabled={!canRepurchase}
          >
            <RefreshCw className="size-3" />
            Repurchase Label
          </Button>
        </div>

        {!canRepurchase ? (
          <p className="text-[10px] text-muted-foreground">
            Repurchase stays locked until the active label refund is submitted
            or completed.
          </p>
        ) : null}
      </div>
    </DialogShell>
  )
}
