import { dollarsToCents } from '../../lib/currency'

export { dollarsToCents }

export function toTimestamp(input: string | undefined | null): number {
  if (!input) return Date.now()
  return new Date(input).getTime()
}

export function shouldMarkOrderFulfilled(status: string): boolean {
  return (
    status === 'shipped' ||
    status === 'in_transit' ||
    status === 'out_for_delivery' ||
    status === 'delivered' ||
    status === 'available_for_pickup'
  )
}
