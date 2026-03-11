import { v } from 'convex/values'

export const inventoryClassValidator = v.union(
  v.literal('single'),
  v.literal('sealed'),
  v.literal('graded'),
)

export const inventoryLocationKindValidator = v.union(
  v.literal('physical'),
  v.literal('system'),
)

export const inventoryWorkflowStatusValidator = v.union(
  v.literal('available'),
  v.literal('processing'),
  v.literal('hold'),
)

export const inventoryReferenceKindValidator = v.literal('catalog')

export const inventoryUnitKindValidator = v.literal('graded_card')

export const SYSTEM_LOCATION_CODES = {
  unassigned: 'SYS:UNASSIGNED',
  adjustment: 'SYS:ADJUSTMENT',
} as const
