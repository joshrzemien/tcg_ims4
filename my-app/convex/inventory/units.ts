import { v } from 'convex/values'
import { mutation, query } from '../_generated/server'
import {
  buildGradedContentIdentityKey,
  buildUnitIdentityKey,
  normalizeOptionalString,
} from './model'
import {
  insertInventoryEvent,
  loadContentById,
  loadUnitDetailByContentId,
} from './shared'

export const upsertGradedDetail = mutation({
  args: {
    contentId: v.id('inventoryLocationContents'),
    gradingCompany: v.string(),
    gradeLabel: v.string(),
    gradeSortValue: v.optional(v.number()),
    certNumber: v.string(),
    notes: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = await loadContentById(ctx, args.contentId)
    if (content.inventoryClass !== 'graded') {
      throw new Error('Unit details can only be attached to graded inventory')
    }
    if (content.quantity !== 1) {
      throw new Error('Graded inventory detail requires a quantity-1 content row')
    }

    const unitIdentityKey = buildUnitIdentityKey({
      gradingCompany: args.gradingCompany,
      certNumber: args.certNumber,
    })

    const existingByIdentity = await ctx.db
      .query('inventoryUnitDetails')
      .withIndex('by_unitIdentityKey', (q) =>
        q.eq('unitIdentityKey', unitIdentityKey),
      )
      .unique()

    if (existingByIdentity && existingByIdentity.contentId !== content._id) {
      throw new Error(
        `Graded unit already exists for ${args.gradingCompany} ${args.certNumber}`,
      )
    }

    const existingByContent = await loadUnitDetailByContentId(ctx, content._id)
    const now = Date.now()

    if (existingByContent) {
      await ctx.db.patch('inventoryUnitDetails', existingByContent._id, {
        unitKind: 'graded_card',
        gradingCompany: args.gradingCompany.trim(),
        gradeLabel: args.gradeLabel.trim(),
        gradeSortValue: args.gradeSortValue,
        certNumber: args.certNumber.trim(),
        notes: normalizeOptionalString(args.notes),
        unitIdentityKey,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('inventoryUnitDetails', {
        contentId: content._id,
        unitKind: 'graded_card',
        gradingCompany: args.gradingCompany.trim(),
        gradeLabel: args.gradeLabel.trim(),
        ...(typeof args.gradeSortValue === 'number'
          ? { gradeSortValue: args.gradeSortValue }
          : {}),
        certNumber: args.certNumber.trim(),
        ...(normalizeOptionalString(args.notes)
          ? { notes: normalizeOptionalString(args.notes) }
          : {}),
        unitIdentityKey,
        createdAt: now,
        updatedAt: now,
      })
    }

    await ctx.db.patch('inventoryLocationContents', content._id, {
      contentIdentityKey: buildGradedContentIdentityKey({
        locationId: content.locationId,
        unitIdentityKey,
      }),
      updatedAt: now,
    })

    await insertInventoryEvent(ctx, {
      eventType: 'unit_detail_upserted',
      actor: args.actor,
      sourceContentId: content._id,
      targetContentId: content._id,
      fromLocationId: content.locationId,
      toLocationId: content.locationId,
      inventoryClass: content.inventoryClass,
      catalogProductKey: content.catalogProductKey,
      catalogSkuKey: content.catalogSkuKey,
      quantityDelta: 0,
      quantityBefore: content.quantity,
      quantityAfter: content.quantity,
      workflowStatusBefore: content.workflowStatus,
      workflowStatusAfter: content.workflowStatus,
      workflowTagBefore: content.workflowTag,
      workflowTagAfter: content.workflowTag,
      unitIdentityKey,
    })

    return content._id
  },
})

export const getByContentId = query({
  args: {
    contentId: v.id('inventoryLocationContents'),
  },
  handler: async (ctx, args) => {
    return await loadUnitDetailByContentId(ctx, args.contentId)
  },
})
