import { v } from 'convex/values'
import { createAddress } from '../sources/easypost'
import type { AddressInput } from '../types'
import type { OrderDoc } from '../workflows/shared'

export type StandaloneAddress = {
  name: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
}

export type StandalonePostageInput = {
  shippingMethod: 'Letter' | 'Parcel'
  weightOz: number
  address: StandaloneAddress
}

export const standaloneAddressValidator = v.object({
  name: v.string(),
  street1: v.string(),
  street2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  country: v.string(),
})

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function parseAddressJson(raw: string): AddressInput {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid EASYPOST_FROM_ADDRESS_JSON: ${(error as Error).message}`,
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('EASYPOST_FROM_ADDRESS_JSON must be a JSON object.')
  }

  const address = parsed as Record<string, unknown>
  const street1 = typeof address.street1 === 'string' ? address.street1.trim() : ''
  const city = typeof address.city === 'string' ? address.city.trim() : ''
  const state = typeof address.state === 'string' ? address.state.trim() : ''
  const zip = typeof address.zip === 'string' ? address.zip.trim() : ''
  const country = typeof address.country === 'string' ? address.country.trim() : ''

  if (!street1 || !city || !state || !zip || !country) {
    throw new Error(
      'EASYPOST_FROM_ADDRESS_JSON must include non-empty street1, city, state, zip, and country fields.',
    )
  }

  return {
    company: typeof address.company === 'string' ? address.company.trim() : undefined,
    street1,
    street2: typeof address.street2 === 'string' ? address.street2 : undefined,
    city,
    state,
    zip,
    country,
    phone: typeof address.phone === 'string' ? address.phone.trim() : undefined,
    name: typeof address.name === 'string' ? address.name.trim() : undefined,
    email: typeof address.email === 'string' ? address.email.trim() : undefined,
  }
}

export function resolveFromAddressInput(): AddressInput {
  return parseAddressJson(requireEnv('EASYPOST_FROM_ADDRESS_JSON'))
}

export async function resolveFromAddressId(apiKey: string): Promise<string> {
  const configuredId = process.env.EASYPOST_FROM_ADDRESS_ID?.trim()
  if (configuredId) {
    return configuredId
  }

  const createdAddress = await createAddress(apiKey, resolveFromAddressInput())
  return createdAddress.easypostAddressId
}

export function configuredCarrierAccountIds(): Array<string> {
  return [requireEnv('EASYPOST_CARRIER_ACCOUNT_ID')]
}

export function requireOrderAddress(order: OrderDoc): AddressInput {
  const address = order.shippingAddress
  const street1 = address.line1.trim()
  const city = address.city.trim()
  const state = address.state.trim()
  const zip = address.postalCode.trim()
  const country = address.country.trim()
  const name = address.name.trim() || order.customerName.trim()

  if (!street1 || !city || !state || !zip || !country || !name) {
    throw new Error(
      `Order ${order.orderNumber} is missing required shipping address fields.`,
    )
  }

  return {
    name,
    street1,
    street2: address.line2?.trim() || address.line3?.trim() || undefined,
    city,
    state,
    zip,
    country,
  }
}

export function requireNonEmptyField(label: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }
  return trimmed
}

export function normalizeWeightOz(
  weightOz: number,
  shippingMethod: 'Letter' | 'Parcel',
) {
  if (!Number.isFinite(weightOz) || weightOz <= 0) {
    throw new Error('Weight must be greater than 0 oz.')
  }

  const normalizedWeightOz = Math.round(weightOz * 100) / 100
  if (shippingMethod === 'Letter' && normalizedWeightOz > 3.5) {
    throw new Error('Letter postage must be 3.5 oz or less.')
  }

  return normalizedWeightOz
}

export function requireStandaloneAddress(
  address: StandaloneAddress,
): AddressInput {
  return {
    name: requireNonEmptyField('Recipient name', address.name),
    street1: requireNonEmptyField('Street', address.street1),
    street2: address.street2?.trim() || undefined,
    city: requireNonEmptyField('City', address.city),
    state: requireNonEmptyField('State', address.state),
    zip: requireNonEmptyField('ZIP code', address.zip),
    country: requireNonEmptyField('Country', address.country),
  }
}
