import type { InventoryClass, InventoryWorkflowBreakdown, InventoryWorkflowStatus } from './types'

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${fieldName} is required`)
  }

  return normalized
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

export function normalizeInventoryQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Inventory quantity must be a non-negative integer')
  }

  return quantity
}

export function normalizeInventoryClass(
  inventoryClass: string,
): InventoryClass {
  if (
    inventoryClass !== 'single' &&
    inventoryClass !== 'sealed' &&
    inventoryClass !== 'graded'
  ) {
    throw new Error(`Unsupported inventory class: ${inventoryClass}`)
  }

  return inventoryClass
}

export function normalizeWorkflowStatus(
  workflowStatus: string | undefined,
): InventoryWorkflowStatus {
  if (workflowStatus === undefined || workflowStatus === '') {
    return 'available'
  }

  if (
    workflowStatus !== 'available' &&
    workflowStatus !== 'processing' &&
    workflowStatus !== 'hold'
  ) {
    throw new Error(`Unsupported workflow status: ${workflowStatus}`)
  }

  return workflowStatus
}

export function normalizeLocationCode(code: string): string {
  const normalized = normalizeRequiredString(code, 'Location code')
  const segments = normalized.split(':').map((segment) => segment.trim())

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error('Location code must use non-empty colon-delimited segments')
  }

  if (segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new Error(
      'Location code segments may only contain letters, numbers, underscores, and hyphens',
    )
  }

  return segments.map((segment) => segment.toUpperCase()).join(':')
}

export function parseLocationCode(code: string) {
  const normalizedCode = normalizeLocationCode(code)
  const pathSegments = normalizedCode.split(':')

  return {
    code: normalizedCode,
    pathSegments,
    depth: pathSegments.length,
  }
}

export function buildParentLocationCode(
  code: string,
): string | undefined {
  const { pathSegments } = parseLocationCode(code)

  if (pathSegments.length <= 1) {
    return undefined
  }

  return pathSegments.slice(0, -1).join(':')
}

export function validateInventoryContent(params: {
  inventoryClass: InventoryClass
  quantity: number
}) {
  const quantity = normalizeInventoryQuantity(params.quantity)

  if (params.inventoryClass === 'graded' && quantity !== 1) {
    throw new Error('Graded inventory content must have quantity 1')
  }

  return quantity
}

export function buildEmptyWorkflowBreakdown(): InventoryWorkflowBreakdown {
  return {
    available: 0,
    processing: 0,
    hold: 0,
  }
}

export function appendWorkflowBreakdown(
  breakdown: InventoryWorkflowBreakdown,
  workflowStatus: InventoryWorkflowStatus,
  quantity: number,
) {
  breakdown[workflowStatus] += quantity
  return breakdown
}

export function normalizeQuantityDelta(quantityDelta: number) {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new Error('quantityDelta must be a non-zero integer')
  }

  return quantityDelta
}

export function normalizeMoveQuantity(quantity: number) {
  const normalized = normalizeInventoryQuantity(quantity)
  if (normalized === 0) {
    throw new Error('Move quantity must be greater than zero')
  }

  return normalized
}
