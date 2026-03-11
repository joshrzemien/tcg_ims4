import { Boxes, MapPinned } from 'lucide-react'
import type { InventoryClass, InventoryView } from './types'

export const INVENTORY_CLASSES: Array<{ key: InventoryClass; label: string }> = [
  { key: 'single', label: 'Singles' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'graded', label: 'Graded' },
]

export const VIEW_MODES: Array<{
  key: InventoryView
  label: string
  icon: typeof Boxes
}> = [
  { key: 'aggregate', label: 'Aggregate Stock', icon: Boxes },
  { key: 'location', label: 'By Location', icon: MapPinned },
]
