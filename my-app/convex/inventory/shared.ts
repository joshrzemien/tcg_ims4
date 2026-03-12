import { buildEmptyWorkflowBreakdown } from './shared/validation'
import type { Doc } from '../_generated/dataModel'

export {
  inventoryClassValidator,
  inventoryLocationKindValidator,
  inventoryReferenceKindValidator,
  inventoryUnitKindValidator,
  inventoryWorkflowStatusValidator,
  SYSTEM_LOCATION_CODES,
} from './shared/validators'
export {
  buildLocationRecord,
  buildContentRecord,
} from './writers/records'
export {
  buildEventRecord,
  insertInventoryEvent,
} from './writers/events'
export {
  loadLocationById,
  loadLocationByCode,
  requireLocationByCode,
  ensureLocationAcceptsContents,
} from './loaders/locations'
export {
  loadProductByKey,
  loadSkuByKey,
  resolveCatalogReference,
} from './loaders/catalog'
export {
  loadContentById,
  loadUnitDetailByContentId,
  loadContentByIdentityKey,
} from './loaders/contents'
export {
  ensurePhysicalLocationByCode,
  ensureSystemLocation,
} from './workflows/systemLocations'
export {
  normalizeMoveQuantity,
  normalizeQuantityDelta,
  buildEmptyWorkflowBreakdown,
} from './shared/validation'
export function summarizeWorkflowBreakdown(
  contents: Array<Doc<'inventoryLocationContents'>>,
) {
  return contents.reduce((breakdown, content) => {
    breakdown[content.workflowStatus] += content.quantity
    return breakdown
  }, buildEmptyWorkflowBreakdown())
}
