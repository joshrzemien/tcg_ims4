import { hydrateInventoryContentRows } from '../lib/readModels'
import type { DbCtx } from '../../lib/ctx'
import type { InventoryContentDoc } from '../shared/types'

export async function hydrateContentRows(
  ctx: DbCtx,
  contents: Array<InventoryContentDoc>,
) {
  return await hydrateInventoryContentRows(ctx, contents)
}
