import { v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'
import {
  DEFAULT_PRINTER_STATION_KEY,
  DEFAULT_PRINTER_STATION_NAME,
  derivePrinterStationStatus,
} from '../../shared/printing'

function summarizeJob(job: any) {
  return {
    _id: job._id,
    stationKey: job.stationKey,
    jobType: job.jobType,
    status: job.status,
    fileName: job.fileName,
    mimeType: job.mimeType,
    orderId: job.orderId,
    shipmentId: job.shipmentId,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedAt: job.failedAt,
    failureCode: job.failureCode,
    failureMessage: job.failureMessage,
    metadata: job.metadata,
  }
}

export const getDefaultStationStatus = query({
  args: {},
  handler: async (ctx) => {
    const station = await ctx.db
      .query('printerStations')
      .withIndex('by_key', (q) => q.eq('key', DEFAULT_PRINTER_STATION_KEY))
      .unique()

    return {
      stationKey: DEFAULT_PRINTER_STATION_KEY,
      name: station?.name ?? DEFAULT_PRINTER_STATION_NAME,
      status: derivePrinterStationStatus(station),
      lastHeartbeatAt: station?.lastHeartbeatAt,
      lastSeenAt: station?.lastSeenAt,
      capabilities: station?.capabilities ?? [
        'shipping_label',
        'packing_slip',
        'pull_sheet',
      ],
    }
  },
})

export const listRecentPrintJobsForOrder = query({
  args: {
    orderId: v.id('orders'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { orderId, limit }) => {
    const maxResults = Math.max(1, Math.min(limit ?? 10, 25))
    const jobs = await ctx.db
      .query('printJobs')
      .withIndex('by_orderId_createdAt', (q) => q.eq('orderId', orderId))
      .order('desc')
      .take(maxResults)

    return jobs.map(summarizeJob)
  },
})

export const listRecentPrintJobsForShipment = query({
  args: {
    shipmentId: v.id('shipments'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { shipmentId, limit }) => {
    const maxResults = Math.max(1, Math.min(limit ?? 10, 25))
    const jobs = await ctx.db
      .query('printJobs')
      .withIndex('by_shipmentId_createdAt', (q) =>
        q.eq('shipmentId', shipmentId),
      )
      .order('desc')
      .take(maxResults)

    return jobs.map(summarizeJob)
  },
})

export const listRecentJobsForShipmentIds = query({
  args: {
    shipmentIds: v.array(v.id('shipments')),
  },
  handler: async (ctx, { shipmentIds }) => {
    const uniqueShipmentIds = [...new Set(shipmentIds)]

    return await Promise.all(
      uniqueShipmentIds.map(async (shipmentId) => {
        const jobs = await ctx.db
          .query('printJobs')
          .withIndex('by_shipmentId_createdAt', (q) =>
            q.eq('shipmentId', shipmentId),
          )
          .order('desc')
          .take(1)
        const job = jobs.length > 0 ? jobs[0] : null

        return {
          shipmentId,
          job: job ? summarizeJob(job) : null,
        }
      }),
    )
  },
})

export const getJobById = internalQuery({
  args: {
    jobId: v.id('printJobs'),
  },
  handler: async (ctx, { jobId }) => {
    return await ctx.db.get('printJobs', jobId)
  },
})
