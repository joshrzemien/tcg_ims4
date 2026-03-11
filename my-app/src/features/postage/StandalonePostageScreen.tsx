import { useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { defaultFormState } from './constants'
import { StandalonePurchaseForm } from './components/StandalonePurchaseForm'
import { StandaloneShipmentList } from './components/StandaloneShipmentList'
import { extractAddress, parseWeightOz } from './lib/shipment'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type {
  StandaloneFormState,
  StandalonePurchaseResult,
  StandaloneQuote,
  StandaloneShipment,
} from './types'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { getErrorMessage } from '~/features/shared/lib/errors'
import { FlashBanner } from '~/features/shared/components/FlashBanner'

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
  const refundStandaloneLabel = useAction(api.shipments.actions.refundStandaloneLabel)

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

        <StandalonePurchaseForm
          form={form}
          quote={quote}
          quoteError={quoteError}
          allowUnverifiedAddress={allowUnverifiedAddress}
          isPreviewing={isPreviewing}
          isPurchasing={isPurchasing}
          onUpdateField={updateField}
          onPreview={() => void handlePreview()}
          onPurchase={() => void handlePurchase()}
          onChangeAllowUnverifiedAddress={setAllowUnverifiedAddress}
        />
      </section>

      <StandaloneShipmentList
        shipments={standaloneShipments}
        refundingShipmentId={refundingShipmentId}
        onRefund={(shipment) => {
          void handleRefund(shipment)
        }}
      />
    </div>
  )
}
