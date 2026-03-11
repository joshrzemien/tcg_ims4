import type { Id } from '../../_generated/dataModel'
import type { DbCtx } from '../../lib/ctx'

export async function loadContentById(
  ctx: DbCtx,
  contentId: Id<'inventoryLocationContents'>,
) {
  const content = await ctx.db.get('inventoryLocationContents', contentId)
  if (!content) {
    throw new Error(`Inventory content not found: ${contentId}`)
  }

  return content
}

export async function loadUnitDetailByContentId(
  ctx: DbCtx,
  contentId: Id<'inventoryLocationContents'>,
) {
  return (await ctx.db
    .query('inventoryUnitDetails')
    .withIndex('by_contentId', (q: any) => q.eq('contentId', contentId))
    .unique())
}

export async function loadContentByIdentityKey(
  ctx: DbCtx,
  contentIdentityKey: string,
) {
  return (await ctx.db
    .query('inventoryLocationContents')
    .withIndex('by_contentIdentityKey', (q: any) =>
      q.eq('contentIdentityKey', contentIdentityKey),
    )
    .unique())
}
