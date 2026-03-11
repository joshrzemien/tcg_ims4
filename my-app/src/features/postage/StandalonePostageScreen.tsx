import { useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import {
  AlertTriangle,
  ExternalLink,
  MapPin,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Undo2,
} from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { isNonRefundableEasyPostLetterShipment } from '../../../shared/shippingRefund'
import {
  formatShippingMethodLabel,
  normalizeShippingMethod,
} from '../../../shared/shippingMethod'
import {
  formatShippingStatusLabel,
  hasRefundedPostage,
  normalizeStatusToken,
} from '../../../shared/shippingStatus'
import type { ShippingMethod } from '../../../shared/shippingMethod'
import type { ShippingStatus } from '../../../shared/shippingStatus'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import { Button } from '~/components/ui/button'
import { FlashBanner } from '~/features/shared/components/FlashBanner'
import { getErrorMessage } from '~/features/shared/lib/errors'
import {
  formatCents,
  formatDateTimeLong,
} from '~/features/shared/lib/formatting'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { cn } from '~/lib/utils'

type StandaloneShipment = Doc<'shipments'> & {
  source: 'standalone'
}

type StandaloneAddressInput = {
  name: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  country: string
}

type StandaloneFormState = StandaloneAddressInput & {
  shippingMethod: ShippingMethod
  weightOz: string
}

type StandaloneQuote = {
  shippingMethod: ShippingMethod
  predefinedPackage: 'letter' | 'parcel'
  weightOz: number
  service: 'First' | 'GroundAdvantage'
  addressVerified: boolean
  verificationErrors: Array<string>
  verifiedAddress: {
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  rate: {
    rateId: string
    carrier: string
    service: string
    rateCents: number
    deliveryDays: number | null
  }
}

type StandalonePurchaseResult = {
  labelUrl?: string
}

const defaultFormState: StandaloneFormState = {
  shippingMethod: 'Letter',
  weightOz: '1',
  name: '',
  street1: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
}

const statusStyles: Record<ShippingStatus, string> = {
  pending: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  processing: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
  created: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
  purchased: 'border-sky-500/20 bg-sky-500/5 text-sky-400',
  pre_transit: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
  in_transit: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-400',
  out_for_delivery: 'border-teal-500/20 bg-teal-500/5 text-teal-400',
  shipped: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-400',
  delivered: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  available_for_pickup: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  return_to_sender: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
  failure: 'border-red-500/20 bg-red-500/5 text-red-400',
  error: 'border-red-500/20 bg-red-500/5 text-red-400',
  cancelled: 'border-zinc-500/20 bg-zinc-500/5 text-zinc-400',
  refunded: 'border-red-500/20 bg-red-500/5 text-red-400',
  replaced: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
  unknown: 'border-slate-500/20 bg-slate-500/5 text-slate-400',
}

function formatRefundStatus(refundStatus?: string) {
  if (!refundStatus) return 'Not requested'
  return humanize(normalizeStatusToken(refundStatus))
}

function formatRateLabel(rate: StandaloneQuote['rate']) {
  const deliveryDays =
    typeof rate.deliveryDays === 'number'
      ? `, ${rate.deliveryDays}d`
      : ''

  return `${rate.carrier} ${rate.service} · ${formatCents(rate.rateCents)}${deliveryDays}`
}

function shipmentHasPurchasedLabel(shipment: StandaloneShipment) {
  return Boolean(
    shipment.trackingNumber || shipment.labelUrl || shipment.easypostTrackerId,
  )
}

function parseWeightOz(rawWeightOz: string) {
  const weightOz = Number.parseFloat(rawWeightOz)
  if (!Number.isFinite(weightOz) || weightOz <= 0) {
    throw new Error('Enter a valid weight in ounces.')
  }

  return Math.round(weightOz * 100) / 100
}

function extractAddress(shipment: StandaloneShipment) {
  const address =
    shipment.toAddress && typeof shipment.toAddress === 'object'
      ? (shipment.toAddress as Record<string, unknown>)
      : null

  return {
    name: typeof address?.name === 'string' ? address.name : 'Unknown recipient',
    street1: typeof address?.street1 === 'string' ? address.street1 : '',
    street2: typeof address?.street2 === 'string' ? address.street2 : '',
    city: typeof address?.city === 'string' ? address.city : '',
    state: typeof address?.state === 'string' ? address.state : '',
    zip: typeof address?.zip === 'string' ? address.zip : '',
    country: typeof address?.country === 'string' ? address.country : '',
  }
}

function formatAddress(shipment: StandaloneShipment) {
  const address = extractAddress(shipment)
  const stateZip = [address.state, address.zip].filter(Boolean).join(' ')
  const locality = [address.city, stateZip].filter(Boolean).join(', ')

  return [address.street1, address.street2, locality, address.country]
    .filter(Boolean)
    .join(' · ')
}

export function StandalonePostageScreen() {
  const shipments = useQuery(api.shipments.queries.listStandalone, {
    limit: 100,
  })
  const previewStandalonePurchase = useAction(
    api.shipments.actions.previewStandalonePurchase,
  )
  const purchaseStandaloneLabel = useAction(
    api.shipments.actions.purchaseStandaloneLabel,
  )
  const refundStandaloneLabel = useAction(
    api.shipments.actions.refundStandaloneLabel,
  )

  const [form, setForm] = useState<StandaloneFormState>(defaultFormState)
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [quote, setQuote] = useState<StandaloneQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [allowUnverifiedAddress, setAllowUnverifiedAddress] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [refundingShipmentId, setRefundingShipmentId] = useState<
    StandaloneShipment['_id'] | null
  >(null)

  const standaloneShipments = useMemo(() => shipments ?? [], [shipments])

  function resetQuoteState() {
    setQuote(null)
    setQuoteError(null)
    setAllowUnverifiedAddress(false)
  }

  function updateField<TField extends keyof StandaloneFormState>(
    field: TField,
    value: StandaloneFormState[TField],
  ) {
    resetQuoteState()
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function buildActionInput() {
    return {
      shippingMethod: form.shippingMethod,
      weightOz: parseWeightOz(form.weightOz),
      address: {
        name: form.name,
        street1: form.street1,
        street2: form.street2 || undefined,
        city: form.city,
        state: form.state,
        zip: form.zip,
        country: form.country,
      },
    }
  }

  async function handlePreview() {
    setFlashMessage(null)
    setQuoteError(null)
    setIsPreviewing(true)

    try {
      const nextQuote = (await previewStandalonePurchase(
        buildActionInput(),
      )) as StandaloneQuote
      setQuote(nextQuote)
    } catch (error) {
      setQuoteError(getErrorMessage(error))
    } finally {
      setIsPreviewing(false)
    }
  }

  async function handlePurchase() {
    if (!quote) {
      return
    }

    setFlashMessage(null)
    setQuoteError(null)
    setIsPurchasing(true)

    try {
      const purchased = (await purchaseStandaloneLabel({
        ...buildActionInput(),
        expectedRateCents: quote.rate.rateCents,
        allowUnverifiedAddress,
      })) as StandalonePurchaseResult

      setFlashMessage({
        kind: 'success',
        text: `Purchased ${form.shippingMethod.toLowerCase()} postage for ${form.name || 'recipient'}.`,
      })
      setQuote(null)

      if (typeof purchased.labelUrl === 'string') {
        window.open(purchased.labelUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setQuoteError(getErrorMessage(error))
    } finally {
      setIsPurchasing(false)
    }
  }

  async function handleRefund(shipment: StandaloneShipment) {
    if (
      !window.confirm(
        'Request a refund for this label? EasyPost only approves unused labels.',
      )
    ) {
      return
    }

    setFlashMessage(null)
    setRefundingShipmentId(shipment._id)

    try {
      const refund = await refundStandaloneLabel({
        shipmentId: shipment._id,
      })

      setFlashMessage({
        kind: 'success',
        text: `Refund ${humanize(refund.easypostRefundStatus)} for ${extractAddress(shipment).name}.`,
      })
    } catch (error) {
      setFlashMessage({
        kind: 'error',
        text: getErrorMessage(error),
      })
    } finally {
      setRefundingShipmentId(null)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      <section className="space-y-4">
        <FlashBanner message={flashMessage} onDismiss={() => setFlashMessage(null)} />

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-sky-300">
              <Receipt className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Create standalone postage
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Buy a label without linking it to a marketplace order.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Shipping method
              </span>
              <select
                value={form.shippingMethod}
                onChange={(event) =>
                  updateField(
                    'shippingMethod',
                    event.target.value as ShippingMethod,
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 transition-colors focus:border-ring"
              >
                <option value="Letter">Letter</option>
                <option value="Parcel">Parcel</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Weight (oz)
              </span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={form.weightOz}
                onChange={(event) => updateField('weightOz', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Recipient name
              </span>
              <input
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Street
              </span>
              <input
                value={form.street1}
                onChange={(event) => updateField('street1', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Apt, suite, etc.
              </span>
              <input
                value={form.street2}
                onChange={(event) => updateField('street2', event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 sm:col-span-1">
                <span className="text-xs font-medium text-muted-foreground">
                  City
                </span>
                <input
                  value={form.city}
                  onChange={(event) => updateField('city', event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  State
                </span>
                <input
                  value={form.state}
                  onChange={(event) => updateField('state', event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  ZIP
                </span>
                <input
                  value={form.zip}
                  onChange={(event) => updateField('zip', event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Country
              </span>
              <input
                value={form.country}
                onChange={(event) => updateField('country', event.target.value)}
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
            <Button
              type="button"
              onClick={() => void handlePreview()}
              disabled={isPreviewing || isPurchasing}
            >
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
                <h3 className="text-sm font-semibold text-foreground">
                  Quote ready
                </h3>
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
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Package
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {quote.predefinedPackage}
                </dd>
              </div>
              <div className="rounded-lg border bg-muted/10 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Weight
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {quote.weightOz} oz
                </dd>
              </div>
              <div className="rounded-lg border bg-muted/10 p-3 sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Service
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {formatRateLabel(quote.rate)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg border bg-muted/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="size-4 text-muted-foreground" />
                Verified destination
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {quote.verifiedAddress.street1}
                {quote.verifiedAddress.street2
                  ? `, ${quote.verifiedAddress.street2}`
                  : ''}
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
                    onChange={(event) =>
                      setAllowUnverifiedAddress(event.target.checked)
                    }
                    className="mt-0.5"
                  />
                  <span>
                    I manually verified this address and want to buy the label
                    anyway.
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={() => void handlePurchase()}
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

      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Postage to review
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Standalone labels from the last 30 days that still have no
                tracking updates.
              </p>
            </div>
          <span className="rounded-full border px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {standaloneShipments.length} active
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {standaloneShipments.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
              No recent labels without tracking updates.
            </div>
          ) : (
            standaloneShipments.map((shipment) => {
              const address = extractAddress(shipment)
              const canRefund =
                shipmentHasPurchasedLabel(shipment) &&
                !hasRefundedPostage(shipment.refundStatus) &&
                shipment.status !== 'delivered' &&
                !isNonRefundableEasyPostLetterShipment(shipment)
              const isRefunding = refundingShipmentId === shipment._id

              return (
                <article
                  key={shipment._id}
                  className="rounded-xl border bg-muted/5 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          {address.name}
                        </h4>
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
                            normalizeShippingMethod(shipment.shippingMethod) ??
                              'Parcel',
                          )}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Refund: {formatRefundStatus(shipment.refundStatus)}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {formatAddress(shipment)}
                      </p>

                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                            Purchased
                          </span>
                          <p className="mt-1 text-foreground">
                            {formatDateTimeLong(shipment.createdAt)}
                          </p>
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
                          <a
                            href={shipment.labelUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-4" />
                            Reprint
                          </a>
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleRefund(shipment)}
                        disabled={!canRefund || isRefunding}
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
    </div>
  )
}
