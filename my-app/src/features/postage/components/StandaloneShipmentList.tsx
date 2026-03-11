import { ExternalLink, RefreshCw, Undo2 } from 'lucide-react'
import {
  formatShippingMethodLabel,
  normalizeShippingMethod,
} from '../../../../shared/shippingMethod'
import { formatShippingStatusLabel } from '../../../../shared/shippingStatus'
import { statusStyles } from '../constants'
import {
  canRefundShipment,
  extractAddress,
  formatAddress,
  formatRefundStatus,
} from '../lib/shipment'
import type { StandaloneShipment } from '../types'
import { Button } from '~/components/ui/button'
import { formatCents, formatDateTimeLong } from '~/features/shared/lib/formatting'
import { cn } from '~/lib/utils'

export function StandaloneShipmentList({
  shipments,
  refundingShipmentId,
  onRefund,
}: {
  shipments: Array<StandaloneShipment>
  refundingShipmentId: StandaloneShipment['_id'] | null
  onRefund: (shipment: StandaloneShipment) => void
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3 border-b pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Postage to review</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Standalone labels from the last 30 days that still have no tracking updates.
          </p>
        </div>
        <span className="rounded-full border px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {shipments.length} active
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {shipments.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            No recent labels without tracking updates.
          </div>
        ) : (
          shipments.map((shipment) => {
            const address = extractAddress(shipment)
            const isRefunding = refundingShipmentId === shipment._id

            return (
              <article key={shipment._id} className="rounded-xl border bg-muted/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{address.name}</h4>
                      {shipment.trackerPublicUrl ? (
                        <a
                          href={shipment.trackerPublicUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline',
                            statusStyles[shipment.status],
                          )}
                          title="Open tracking details"
                        >
                          {formatShippingStatusLabel(shipment.status)}
                        </a>
                      ) : (
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            statusStyles[shipment.status],
                          )}
                        >
                          {formatShippingStatusLabel(shipment.status)}
                        </span>
                      )}
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Standalone
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {formatShippingMethodLabel(
                          normalizeShippingMethod(shipment.shippingMethod) ?? 'Parcel',
                        )}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Refund: {formatRefundStatus(shipment.refundStatus)}
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground">{formatAddress(shipment)}</p>

                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          Purchased
                        </span>
                        <p className="mt-1 text-foreground">{formatDateTimeLong(shipment.createdAt)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          Service
                        </span>
                        <p className="mt-1 text-foreground">
                          {shipment.carrier && shipment.service
                            ? `${shipment.carrier} ${shipment.service}`
                            : 'Pending'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          Postage
                        </span>
                        <p className="mt-1 text-foreground">
                          {typeof shipment.rateCents === 'number'
                            ? formatCents(shipment.rateCents)
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {shipment.labelUrl ? (
                      <Button asChild variant="outline">
                        <a href={shipment.labelUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                          Reprint
                        </a>
                      </Button>
                    ) : null}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onRefund(shipment)}
                      disabled={!canRefundShipment(shipment) || isRefunding}
                    >
                      {isRefunding ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          Refunding...
                        </>
                      ) : (
                        <>
                          <Undo2 className="size-4" />
                          Refund
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
