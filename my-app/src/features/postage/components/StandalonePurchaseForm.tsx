import { AlertTriangle, MapPin, Receipt, RefreshCw, ShieldAlert } from 'lucide-react'
import { formatShippingMethodLabel } from '../../../../shared/shippingMethod'
import { formatRateLabel } from '../lib/shipment'
import type { ShippingMethod } from '../../../../shared/shippingMethod'
import type { StandaloneFormState, StandaloneQuote } from '../types'
import { Button } from '~/components/ui/button'
import { formatCents } from '~/features/shared/lib/formatting'

export function StandalonePurchaseForm({
  form,
  quote,
  quoteError,
  allowUnverifiedAddress,
  isPreviewing,
  isPurchasing,
  onUpdateField,
  onPreview,
  onPurchase,
  onChangeAllowUnverifiedAddress,
}: {
  form: StandaloneFormState
  quote: StandaloneQuote | null
  quoteError: string | null
  allowUnverifiedAddress: boolean
  isPreviewing: boolean
  isPurchasing: boolean
  onUpdateField: <TField extends keyof StandaloneFormState>(
    field: TField,
    value: StandaloneFormState[TField],
  ) => void
  onPreview: () => void
  onPurchase: () => void
  onChangeAllowUnverifiedAddress: (value: boolean) => void
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-sky-300">
            <Receipt className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Create standalone postage</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Buy a label without linking it to a marketplace order.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Shipping method</span>
            <select
              value={form.shippingMethod}
              onChange={(event) => onUpdateField('shippingMethod', event.target.value as ShippingMethod)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 transition-colors focus:border-ring"
            >
              <option value="Letter">Letter</option>
              <option value="Parcel">Parcel</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Weight (oz)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={form.weightOz}
              onChange={(event) => onUpdateField('weightOz', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Recipient name</span>
            <input
              value={form.name}
              onChange={(event) => onUpdateField('name', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Street</span>
            <input
              value={form.street1}
              onChange={(event) => onUpdateField('street1', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Apt, suite, etc.</span>
            <input
              value={form.street2}
              onChange={(event) => onUpdateField('street2', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 sm:col-span-1">
              <span className="text-xs font-medium text-muted-foreground">City</span>
              <input
                value={form.city}
                onChange={(event) => onUpdateField('city', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">State</span>
              <input
                value={form.state}
                onChange={(event) => onUpdateField('state', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">ZIP</span>
              <input
                value={form.zip}
                onChange={(event) => onUpdateField('zip', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Country</span>
            <input
              value={form.country}
              onChange={(event) => onUpdateField('country', event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm uppercase outline-none transition-colors focus:border-ring"
            />
          </label>
        </div>

        {quoteError ? (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
            {quoteError}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={onPreview} disabled={isPreviewing || isPurchasing}>
            {isPreviewing ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Quoting...
              </>
            ) : (
              'Preview Postage'
            )}
          </Button>
        </div>
      </div>

      {quote ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Quote ready</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Review the label details before purchase.
              </p>
            </div>
            <span className="rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {formatShippingMethodLabel(quote.shippingMethod)}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/10 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Package</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{quote.predefinedPackage}</dd>
            </div>
            <div className="rounded-lg border bg-muted/10 p-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Weight</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{quote.weightOz} oz</dd>
            </div>
            <div className="rounded-lg border bg-muted/10 p-3 sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Service</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{formatRateLabel(quote.rate)}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-lg border bg-muted/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MapPin className="size-4 text-muted-foreground" />
              Verified destination
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {quote.verifiedAddress.street1}
              {quote.verifiedAddress.street2 ? `, ${quote.verifiedAddress.street2}` : ''}
              {` · ${quote.verifiedAddress.city}, ${quote.verifiedAddress.state} ${quote.verifiedAddress.zip} · ${quote.verifiedAddress.country}`}
            </p>
          </div>

          {!quote.addressVerified ? (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
                <ShieldAlert className="size-4" />
                Address not verified
              </div>
              <ul className="mt-2 space-y-1 text-sm text-amber-100/80">
                {quote.verificationErrors.map((error) => (
                  <li key={error} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2 text-sm text-amber-100">
                <input
                  type="checkbox"
                  checked={allowUnverifiedAddress}
                  onChange={(event) => onChangeAllowUnverifiedAddress(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I manually verified this address and want to buy the label anyway.</span>
              </label>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={onPurchase}
              disabled={
                isPurchasing ||
                isPreviewing ||
                (!quote.addressVerified && !allowUnverifiedAddress)
              }
            >
              {isPurchasing ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Purchasing...
                </>
              ) : (
                `Buy Label ${formatCents(quote.rate.rateCents)}`
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
