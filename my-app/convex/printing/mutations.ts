import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { mutation } from '../lib/auth'
import {
  DEFAULT_PRINTER_STATION_KEY,
  DEFAULT_PRINTER_STATION_NAME,
  PRINT_JOB_RECENT_DEDUPE_WINDOW_MS,
} from '../../shared/printing'
import {
  printJobMetadataValidator,
  printJobTypeValidator,
  printSourceKindValidator,
  printerCapabilityValidator,
} from './types'
import type { Doc, Id } from '../_generated/dataModel'

function defaultCapabilities() {
  return [
    'shipping_label',
    'packing_slip',
    'pull_sheet',
    'ad_hoc_document',
  ] as const
}

async function getStationByKey(ctx: { db: any }, stationKey: string) {
  return await ctx.db
    .query('printerStations')
    .withIndex('by_key', (q: any) => q.eq('key', stationKey))
    .unique()
}

async function ensureStation(
  ctx: { db: any },
  stationKey: string,
  options?: {
    status?: Doc<'printerStations'>['status']
    capabilities?: Array<Doc<'printerStations'>['capabilities'][number]>
    agentVersion?: string
    lastHeartbeatAt?: number
    lastSeenAt?: number
  },
) {
  const now = Date.now()
  const existing = await getStationByKey(ctx, stationKey)
  const nextCapabilities = options?.capabilities ??
    existing?.capabilities ?? [...defaultCapabilities()]

  if (existing) {
    await ctx.db.patch('printerStations', existing._id, {
      ...(options?.status ? { status: options.status } : {}),
      capabilities: nextCapabilities,
      ...(typeof options?.agentVersion === 'string'
        ? { agentVersion: options.agentVersion }
        : {}),
      ...(typeof options?.lastHeartbeatAt === 'number'
        ? { lastHeartbeatAt: options.lastHeartbeatAt }
        : {}),
      ...(typeof options?.lastSeenAt === 'number'
        ? { lastSeenAt: options.lastSeenAt }
        : {}),
      updatedAt: now,
    })
    return existing._id as Id<'printerStations'>
  }

  return await ctx.db.insert('printerStations', {
    key: stationKey,
    name:
      stationKey === DEFAULT_PRINTER_STATION_KEY
        ? DEFAULT_PRINTER_STATION_NAME
        : stationKey,
    status: options?.status ?? 'unknown',
    capabilities: nextCapabilities,
    ...(typeof options?.agentVersion === 'string'
      ? { agentVersion: options.agentVersion }
      : {}),
    ...(typeof options?.lastHeartbeatAt === 'number'
      ? { lastHeartbeatAt: options.lastHeartbeatAt }
      : {}),
    ...(typeof options?.lastSeenAt === 'number'
      ? { lastSeenAt: options.lastSeenAt }
      : {}),
    createdAt: now,
    updatedAt: now,
  })
}

async function maybeReturnRecentDuplicate(
  ctx: { db: any },
  dedupeKey: string,
  now: number,
) {
  const recentJobs = await ctx.db
    .query('printJobs')
    .withIndex('by_dedupeKey', (q: any) => q.eq('dedupeKey', dedupeKey))
    .collect()

  return recentJobs
    .filter(
      (job: Doc<'printJobs'>) =>
        typeof job.requestedAt === 'number' &&
        now - job.requestedAt <= PRINT_JOB_RECENT_DEDUPE_WINDOW_MS &&
        job.status !== 'failed' &&
        job.status !== 'cancelled',
    )
    .sort((left: Doc<'printJobs'>, right: Doc<'printJobs'>) => {
      if (left.requestedAt !== right.requestedAt) {
        return right.requestedAt - left.requestedAt
      }
      return right.updatedAt - left.updatedAt
    })[0]
}

async function enqueueJobRecord(
  ctx: { db: any },
  args: {
    stationKey: string
    jobType: Doc<'printJobs'>['jobType']
    sourceKind: Doc<'printJobs'>['sourceKind']
    sourceUrl?: string
    storageId?: Id<'_storage'>
    fileName?: string
    mimeType?: string
    copies?: number
    dedupeKey?: string
    orderId?: Id<'orders'>
    shipmentId?: Id<'shipments'>
    orderIds?: Array<Id<'orders'>>
    metadata: Doc<'printJobs'>['metadata']
  },
): Promise<{
  printJobId: Id<'printJobs'>
  printStatus: 'queued'
  stationKey: string
}> {
  if (args.sourceKind === 'remote_url' && !args.sourceUrl) {
    throw new Error('Remote print jobs must include a source URL.')
  }
  if (args.sourceKind === 'stored_document' && !args.storageId) {
    throw new Error('Stored-document print jobs must include a storage ID.')
  }

  const now = Date.now()
  await ensureStation(ctx, args.stationKey)

  if (typeof args.dedupeKey === 'string' && args.dedupeKey.length > 0) {
    const duplicate = await maybeReturnRecentDuplicate(ctx, args.dedupeKey, now)
    if (duplicate) {
      return {
        printJobId: duplicate._id,
        printStatus: 'queued',
        stationKey: duplicate.stationKey,
      }
    }
  }

  const printJobId = await ctx.db.insert('printJobs', {
    stationKey: args.stationKey,
    jobType: args.jobType,
    status: 'queued',
    sourceKind: args.sourceKind,
    ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
    ...(args.storageId ? { storageId: args.storageId } : {}),
    ...(args.fileName ? { fileName: args.fileName } : {}),
    ...(args.mimeType ? { mimeType: args.mimeType } : {}),
    copies: Math.max(1, args.copies ?? 1),
    ...(args.dedupeKey ? { dedupeKey: args.dedupeKey } : {}),
    ...(args.orderId ? { orderId: args.orderId } : {}),
    ...(args.shipmentId ? { shipmentId: args.shipmentId } : {}),
    ...(args.orderIds && args.orderIds.length > 0
      ? { orderIds: args.orderIds }
      : {}),
    requestedAt: now,
    requestedBy: 'app',
    attemptCount: 0,
    metadata: args.metadata,
    createdAt: now,
    updatedAt: now,
  })

  return {
    printJobId,
    printStatus: 'queued',
    stationKey: args.stationKey,
  }
}

async function touchStationSeen(ctx: { db: any }, stationKey: string) {
  await ensureStation(ctx, stationKey, {
    status: 'online',
    lastSeenAt: Date.now(),
  })
}

function assertStationOwnsJob(
  job: Doc<'printJobs'>,
  stationKey: string,
  expectedStatuses: Array<Doc<'printJobs'>['status']>,
) {
  if (job.stationKey !== stationKey) {
    throw new Error('Print job does not belong to this station.')
  }
  if (!expectedStatuses.includes(job.status)) {
    throw new Error(`Print job is not ${expectedStatuses.join(' or ')}.`)
  }
}

export const enqueueJob = internalMutation({
  args: {
    stationKey: v.string(),
    jobType: printJobTypeValidator,
    sourceKind: printSourceKindValidator,
    sourceUrl: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    copies: v.optional(v.number()),
    dedupeKey: v.optional(v.string()),
    orderId: v.optional(v.id('orders')),
    shipmentId: v.optional(v.id('shipments')),
    orderIds: v.optional(v.array(v.id('orders'))),
    metadata: printJobMetadataValidator,
  },
  handler: async (ctx, args) => {
    return await enqueueJobRecord(ctx, args)
  },
})

export const heartbeatStation = internalMutation({
  args: {
    stationKey: v.string(),
    agentVersion: v.optional(v.string()),
    capabilities: v.array(printerCapabilityValidator),
  },
  handler: async (ctx, { stationKey, agentVersion, capabilities }) => {
    const now = Date.now()
    await ensureStation(ctx, stationKey, {
      status: 'online',
      agentVersion,
      capabilities,
      lastHeartbeatAt: now,
      lastSeenAt: now,
    })

    return {
      stationKey,
      status: 'online' as const,
      lastHeartbeatAt: now,
    }
  },
})

export const claimNextJob = internalMutation({
  args: {
    stationKey: v.string(),
  },
  handler: async (ctx, { stationKey }) => {
    await touchStationSeen(ctx, stationKey)

    const nextJob = (
      await ctx.db
        .query('printJobs')
        .withIndex('by_stationKey_status_requestedAt', (q: any) =>
          q.eq('stationKey', stationKey).eq('status', 'queued'),
        )
        .order('asc')
        .take(1)
    )[0] as Doc<'printJobs'> | undefined

    if (!nextJob) {
      return null
    }

    const now = Date.now()
    await ctx.db.patch('printJobs', nextJob._id, {
      status: 'claimed',
      claimedAt: now,
      claimedByStationKey: stationKey,
      lastHeartbeatAt: now,
      updatedAt: now,
    })

    return {
      ...nextJob,
      status: 'claimed' as const,
      claimedAt: now,
      claimedByStationKey: stationKey,
      lastHeartbeatAt: now,
      updatedAt: now,
    }
  },
})

export const markJobStarted = internalMutation({
  args: {
    stationKey: v.string(),
    jobId: v.id('printJobs'),
  },
  handler: async (ctx, { stationKey, jobId }) => {
    const job = await ctx.db.get('printJobs', jobId)
    if (!job) {
      throw new Error(`Print job not found: ${jobId}`)
    }

    assertStationOwnsJob(job, stationKey, ['claimed', 'printing'])
    const now = Date.now()
    await touchStationSeen(ctx, stationKey)
    await ctx.db.patch('printJobs', job._id, {
      status: 'printing',
      startedAt: job.startedAt ?? now,
      lastHeartbeatAt: now,
      updatedAt: now,
    })

    return {
      jobId,
      status: 'printing' as const,
    }
  },
})

export const markJobComplete = internalMutation({
  args: {
    stationKey: v.string(),
    jobId: v.id('printJobs'),
  },
  handler: async (ctx, { stationKey, jobId }) => {
    const job = await ctx.db.get('printJobs', jobId)
    if (!job) {
      throw new Error(`Print job not found: ${jobId}`)
    }

    assertStationOwnsJob(job, stationKey, ['claimed', 'printing'])
    const now = Date.now()
    await touchStationSeen(ctx, stationKey)
    await ctx.db.patch('printJobs', job._id, {
      status: 'printed',
      completedAt: now,
      lastHeartbeatAt: now,
      failureCode: undefined,
      failureMessage: undefined,
      updatedAt: now,
    })

    return {
      jobId,
      status: 'printed' as const,
    }
  },
})

export const markJobFailed = internalMutation({
  args: {
    stationKey: v.string(),
    jobId: v.id('printJobs'),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
  },
  handler: async (ctx, { stationKey, jobId, failureCode, failureMessage }) => {
    const job = await ctx.db.get('printJobs', jobId)
    if (!job) {
      throw new Error(`Print job not found: ${jobId}`)
    }

    assertStationOwnsJob(job, stationKey, ['claimed', 'printing'])
    const now = Date.now()
    await touchStationSeen(ctx, stationKey)
    await ctx.db.patch('printJobs', job._id, {
      status: 'failed',
      failedAt: now,
      lastHeartbeatAt: now,
      failureCode,
      failureMessage,
      attemptCount: job.attemptCount + 1,
      updatedAt: now,
    })

    return {
      jobId,
      status: 'failed' as const,
    }
  },
})

export const queueShipmentLabelReprint = mutation({
  args: {
    shipmentId: v.id('shipments'),
  },
  handler: async (ctx, { shipmentId }) => {
    const shipment = await ctx.db.get('shipments', shipmentId)
    if (!shipment?.labelUrl) {
      throw new Error('This shipment does not have a printable label URL.')
    }

    return await enqueueJobRecord(ctx, {
      stationKey: DEFAULT_PRINTER_STATION_KEY,
      jobType: 'shipping_label',
      sourceKind: 'remote_url',
      sourceUrl: shipment.labelUrl,
      copies: 1,
      dedupeKey: `shipping_label:${shipment._id}:${shipment.labelUrl}`,
      ...(shipment.orderId ? { orderId: shipment.orderId } : {}),
      shipmentId: shipment._id,
      metadata: {
        carrier: shipment.carrier,
        service: shipment.service,
      },
    })
  },
})
