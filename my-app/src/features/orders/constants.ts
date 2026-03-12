import type { ShippingStatus } from '../../../shared/shippingStatus'
import type { PresetFilter } from './types'

export const EMPTY_ROWS = []

export const statusStyles: Record<ShippingStatus, string> = {
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

export const fulfillmentStyles = {
  fulfilled: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  unfulfilled: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
}

export const channelStyles: Record<string, string> = {
  tcgplayer: 'border-orange-500/20 bg-orange-500/5 text-orange-400',
  manapool: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
}

export const numericColumns = new Set(['itemCount', 'totalAmountCents', 'createdAt'])

export const columnWidths: Partial<Record<string, string>> = {
  orderNumber: 'w-[9rem] min-w-[9rem]',
  channel: 'w-[5.5rem] min-w-[5.5rem]',
  customerName: 'w-[12rem] min-w-[12rem]',
  shippingStatus: 'w-[9rem] min-w-[9rem]',
  isFulfilled: 'w-[5rem] min-w-[5rem]',
  shippingMethod: 'w-[6rem] min-w-[6rem]',
  itemCount: 'w-[3.5rem] min-w-[3.5rem]',
  totalAmountCents: 'w-[5.5rem] min-w-[5.5rem]',
  createdAt: 'w-[7rem] min-w-[7rem]',
  actions: 'w-[5.5rem] min-w-[5.5rem]',
}

export const FILTER_OPTIONS: ReadonlyArray<readonly [PresetFilter, string]> = [
  ['unfulfilled', 'Unfulfilled'],
  ['all', 'All'],
  ['last7', '7d'],
  ['last30', '30d'],
]
