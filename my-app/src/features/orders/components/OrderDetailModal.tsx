import { formatOrderItemMeta, inventoryStatusTone } from '../lib/shipment'
import type { OrderPickContext, OrderRow } from '../types'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'
import { formatCents } from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { cn } from '~/lib/utils'

export function OrderDetailModal({
  order,
  orderPickContext,
  onClose,
}: {
  order: OrderRow
  orderPickContext: OrderPickContext | null | undefined
  onClose: () => void
}) {
  return (
    <DialogShell
      title={`Order: ${order.orderNumber}`}
      description="Review order contents and pull locations for each linked SKU."
      onClose={onClose}
      widthClass="max-w-5xl"
    >
      <div className="space-y-3">
        <div className="grid gap-2 rounded border bg-muted/5 p-3 md:grid-cols-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Customer
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">{order.customerName}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Channel
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {humanize(order.channel)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Items
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">{order.itemCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {formatCents(order.totalAmountCents)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Fulfillment
            </p>
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {order.isFulfilled ? 'Fulfilled' : 'Unfulfilled'}
            </p>
          </div>
        </div>

        {orderPickContext === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded border bg-muted/20" />
            ))}
          </div>
        ) : orderPickContext === null ? (
          <div className="rounded border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            Order not found.
          </div>
        ) : (
          <div className="space-y-3">
            {orderPickContext.items.map((item) => {
              const exactSkuLinked =
                typeof item.catalogSkuKey === 'string' && item.catalogSkuKey.length > 0
              const meta = formatOrderItemMeta(item)

              return (
                <div key={`${item.itemIndex}-${item.name}`} className="rounded border bg-muted/5 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Qty {item.quantity}
                        </span>
                        <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {humanize(item.productType)}
                        </span>
                      </div>
                      {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>
                          SKU link:{' '}
                          <span className="font-mono text-foreground">
                            {item.catalogSkuKey ?? 'unlinked'}
                          </span>
                        </span>
                        {typeof item.tcgplayerSku === 'number' ? (
                          <span>
                            TCGplayer SKU:{' '}
                            <span className="font-mono text-foreground">{item.tcgplayerSku}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'rounded border px-3 py-2 text-xs',
                        inventoryStatusTone(item.quantity, item.inventory.availableQuantity),
                      )}
                    >
                      <p className="font-semibold">
                        Available {item.inventory.availableQuantity} / Ordered {item.quantity}
                      </p>
                      <p className="mt-0.5 text-[11px]">
                        Total across all workflow states: {item.inventory.totalQuantity}
                      </p>
                    </div>
                  </div>

                  {!exactSkuLinked ? (
                    <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                      This order item is not linked to a catalog SKU yet, so exact pull locations cannot be resolved.
                    </div>
                  ) : item.inventory.rows.length === 0 ? (
                    <div className="mt-3 rounded border border-dashed bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
                      No inventory rows found for this SKU.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Pull Locations
                      </p>
                      {item.inventory.rows.map((row) => (
                        <div
                          key={row.contentId}
                          className="grid gap-2 rounded border bg-background/70 px-3 py-2 text-xs md:grid-cols-[minmax(0,1.5fr)_auto_auto]"
                        >
                          <div className="min-w-0">
                            <p className="font-mono font-medium text-foreground">
                              {row.location.code}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {row.location.displayName ?? row.location.kind}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                                row.workflowStatus === 'available'
                                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                                  : row.workflowStatus === 'processing'
                                    ? 'border-blue-500/20 bg-blue-500/5 text-blue-400'
                                    : 'border-amber-500/20 bg-amber-500/5 text-amber-400',
                              )}
                            >
                              {humanize(row.workflowStatus)}
                            </span>
                            {row.workflowTag ? (
                              <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {row.workflowTag}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-start md:justify-end">
                            <span className="font-semibold tabular-nums text-foreground">
                              Qty {row.quantity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </DialogShell>
  )
}
