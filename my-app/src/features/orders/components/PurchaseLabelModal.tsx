import { formatRateLabel } from '../lib/shipment'
import type { OrderRow, PurchaseQuote } from '../types'
import { Button } from '~/components/ui/button'
import { DialogShell } from '~/features/shared/components/DialogShell'

export function PurchaseLabelModal({
  purchaseOrder,
  purchaseQuote,
  allowUnverifiedAddress,
  purchaseError,
  isPreviewing,
  isPurchasing,
  onClose,
  onSubmit,
  onChangeAllowUnverifiedAddress,
}: {
  purchaseOrder: OrderRow
  purchaseQuote: PurchaseQuote | null
  allowUnverifiedAddress: boolean
  purchaseError: string | null
  isPreviewing: boolean
  isPurchasing: boolean
  onClose: () => void
  onSubmit: () => void
  onChangeAllowUnverifiedAddress: (value: boolean) => void
}) {
  return (
    <DialogShell
      title={`Purchase Shipping: ${purchaseOrder.orderNumber}`}
      description="Rates are quoted live from EasyPost. Purchase is blocked if the quoted service or price changes before buy."
      onClose={onClose}
    >
      <div className="space-y-3">
        {isPreviewing ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-muted/30" />
            <div className="h-20 animate-pulse rounded bg-muted/20" />
            <div className="h-24 animate-pulse rounded bg-muted/15" />
          </div>
        ) : purchaseQuote ? (
          <>
            <div className="grid gap-2 rounded border bg-muted/5 p-3 md:grid-cols-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Method
                </p>
                <p className="mt-0.5 text-xs font-medium">{purchaseQuote.shippingMethod}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Package
                </p>
                <p className="mt-0.5 text-xs font-medium">{purchaseQuote.predefinedPackage}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Weight
                </p>
                <p className="mt-0.5 text-xs font-medium">{purchaseQuote.weightOz} oz</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Quantity
                </p>
                <p className="mt-0.5 text-xs font-medium">{purchaseQuote.quantity} cards</p>
              </div>
            </div>

            <div className="rounded border bg-muted/5 p-3">
              <p className="text-xs font-semibold text-foreground">Verified destination</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {purchaseQuote.verifiedAddress.street1}
                {purchaseQuote.verifiedAddress.street2
                  ? `, ${purchaseQuote.verifiedAddress.street2}`
                  : ''}
                <br />
                {purchaseQuote.verifiedAddress.city}, {purchaseQuote.verifiedAddress.state}{' '}
                {purchaseQuote.verifiedAddress.zip}
                <br />
                {purchaseQuote.verifiedAddress.country}
              </p>
            </div>

            {!purchaseQuote.addressVerified ? (
              <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                <p className="font-semibold">Address verification warning</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {purchaseQuote.verificationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allowUnverifiedAddress}
                    onChange={(event) => onChangeAllowUnverifiedAddress(event.target.checked)}
                  />
                  <span>
                    I have manually verified this address and approve buying postage anyway.
                  </span>
                </label>
              </div>
            ) : null}

            <div className="rounded border bg-muted/5 p-3">
              <p className="text-xs font-semibold text-foreground">Selected service</p>
              <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  {formatRateLabel(purchaseQuote.rate)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Derived from shipping method: {purchaseQuote.shippingMethod} {'->'}{' '}
                  {purchaseQuote.service}
                </p>
              </div>
            </div>
          </>
        ) : null}

        {purchaseError ? (
          <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400">
            {purchaseError}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPurchasing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={
              isPreviewing ||
              isPurchasing ||
              !purchaseQuote ||
              (!purchaseQuote.addressVerified && !allowUnverifiedAddress)
            }
          >
            {isPurchasing ? 'Purchasing...' : 'Buy Label'}
          </Button>
        </div>
      </div>
    </DialogShell>
  )
}
