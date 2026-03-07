import { normalizeShippingMethod } from './shippingMethod'
import { normalizeStatusToken } from './shippingStatus'

export function isNonRefundableEasyPostLetterShipment(
  shipment:
    | {
        carrier?: unknown
        service?: unknown
        shippingMethod?: unknown
      }
    | null
    | undefined,
): boolean {
  if (!shipment) return false

  const carrier = normalizeStatusToken(shipment.carrier)
  if (carrier !== 'usps') {
    return false
  }

  const shippingMethod = normalizeShippingMethod(
    shipment.shippingMethod ?? shipment.service,
  )

  return shippingMethod === 'Letter'
}

export function getNonRefundableEasyPostLetterShipmentMessage(): string {
  return 'USPS First-Class letters and flats are not eligible for refunds through EasyPost.'
}
