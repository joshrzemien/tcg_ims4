import { isNonRefundableEasyPostLetterShipment } from '../../../../shared/shippingRefund'
import { hasRefundedPostage, normalizeStatusToken } from '../../../../shared/shippingStatus'
import type { StandaloneQuote, StandaloneShipment } from '../types'
import { formatCents } from '~/features/shared/lib/formatting'
import { humanizeToken } from '~/features/shared/lib/text'

export function formatRefundStatus(refundStatus?: string) {
  if (!refundStatus) return 'Not requested'
  return humanizeToken(normalizeStatusToken(refundStatus))
}

export function formatRateLabel(rate: StandaloneQuote['rate']) {
  const deliveryDays =
    typeof rate.deliveryDays === 'number'
      ? `, ${rate.deliveryDays}d`
      : ''

  return `${rate.carrier} ${rate.service} · ${formatCents(rate.rateCents)}${deliveryDays}`
}

export function shipmentHasPurchasedLabel(shipment: StandaloneShipment) {
  return Boolean(
    shipment.trackingNumber || shipment.labelUrl || shipment.easypostTrackerId,
  )
}

export function canRefundShipment(shipment: StandaloneShipment) {
  return (
    shipmentHasPurchasedLabel(shipment) &&
    !hasRefundedPostage(shipment.refundStatus) &&
    shipment.status !== 'delivered' &&
    !isNonRefundableEasyPostLetterShipment(shipment)
  )
}

export function parseWeightOz(rawWeightOz: string) {
  const weightOz = Number.parseFloat(rawWeightOz)
  if (!Number.isFinite(weightOz) || weightOz <= 0) {
    throw new Error('Enter a valid weight in ounces.')
  }

  return Math.round(weightOz * 100) / 100
}

export function extractAddress(shipment: StandaloneShipment) {
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

export function formatAddress(shipment: StandaloneShipment) {
  const address = extractAddress(shipment)
  const stateZip = [address.state, address.zip].filter(Boolean).join(' ')
  const locality = [address.city, stateZip].filter(Boolean).join(', ')

  return [address.street1, address.street2, locality, address.country]
    .filter(Boolean)
    .join(' · ')
}
