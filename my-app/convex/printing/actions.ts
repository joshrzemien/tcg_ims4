import { v } from 'convex/values'
import { action } from '../lib/auth'
import { internal } from '../_generated/api'
import { DEFAULT_PRINTER_STATION_KEY } from '../../shared/printing'
import type { Id } from '../_generated/dataModel'

const MAX_AD_HOC_PRINT_COPIES = 20

type AdHocPrintDispatchResult = {
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
  fileName: string
  mimeType: 'application/pdf'
  copies: number
}

function isPdfUpload(
  blobMimeType: string | undefined,
  fileName: string,
): boolean {
  return (
    blobMimeType === 'application/pdf' ||
    fileName.toLowerCase().endsWith('.pdf')
  )
}

function normalizePdfFileName(fileName: string | undefined): string {
  const fileNameParts = fileName?.split(/[\\/]/)
  const rawName = fileNameParts?.[fileNameParts.length - 1]?.trim()
  if (!rawName) {
    return `document-${Date.now()}.pdf`
  }

  return rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`
}

function normalizeCopyCount(copies: number | undefined): number {
  if (!Number.isFinite(copies)) {
    return 1
  }

  return Math.min(MAX_AD_HOC_PRINT_COPIES, Math.max(1, Math.round(copies!)))
}

export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const discardUpload = action({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId)

    return {
      discarded: true as const,
    }
  },
})

export const queueUploadedPdf = action({
  args: {
    storageId: v.id('_storage'),
    fileName: v.optional(v.string()),
    copies: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { storageId, fileName, copies },
  ): Promise<AdHocPrintDispatchResult> => {
    const blob = await ctx.storage.get(storageId)
    if (!blob) {
      throw new Error(`Uploaded PDF not found: ${storageId}`)
    }

    const normalizedFileName = normalizePdfFileName(fileName)
    const normalizedMimeType = blob.type.trim().toLowerCase()
    if (!isPdfUpload(normalizedMimeType, normalizedFileName)) {
      throw new Error('Only PDF files can be queued for ad hoc printing.')
    }

    const normalizedCopies = normalizeCopyCount(copies)
    const printDispatch: {
      printJobId: Id<'printJobs'>
      printStatus: 'queued'
      stationKey: string
    } = await ctx.runMutation(internal.printing.mutations.enqueueJob, {
      stationKey: DEFAULT_PRINTER_STATION_KEY,
      jobType: 'ad_hoc_document',
      sourceKind: 'stored_document',
      storageId,
      fileName: normalizedFileName,
      mimeType: 'application/pdf',
      copies: normalizedCopies,
      metadata: {},
    })

    return {
      ...printDispatch,
      fileName: normalizedFileName,
      mimeType: 'application/pdf' as const,
      copies: normalizedCopies,
    }
  },
})
