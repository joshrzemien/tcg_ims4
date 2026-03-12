import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import type { Id } from './_generated/dataModel'

const http = httpRouter()

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

function unauthorizedResponse() {
  return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
}

function validateStationToken(request: Request) {
  const configuredToken = process.env.PRINTER_STATION_TOKEN?.trim()
  if (!configuredToken) {
    throw new Error('Missing PRINTER_STATION_TOKEN environment variable.')
  }

  return request.headers.get('x-printer-station-token') === configuredToken
}

async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

http.route({
  path: '/printer-agent/heartbeat',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!validateStationToken(request)) {
      return unauthorizedResponse()
    }

    const body = await readJsonBody(request)
    const result = await ctx.runMutation(
      internal.printing.mutations.heartbeatStation,
      {
        stationKey: typeof body.stationKey === 'string' ? body.stationKey : '',
        agentVersion:
          typeof body.agentVersion === 'string' ? body.agentVersion : undefined,
        capabilities: Array.isArray(body.capabilities)
          ? body.capabilities.filter(
              (
                value,
              ):
                value is
                  | 'shipping_label'
                  | 'packing_slip'
                  | 'pull_sheet'
                  | 'ad_hoc_document' =>
                value === 'shipping_label' ||
                value === 'packing_slip' ||
                value === 'pull_sheet' ||
                value === 'ad_hoc_document',
            )
          : [],
      },
    )

    return jsonResponse(result)
  }),
})

http.route({
  path: '/printer-agent/claim-next',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!validateStationToken(request)) {
      return unauthorizedResponse()
    }

    const body = await readJsonBody(request)
    const job = await ctx.runMutation(
      internal.printing.mutations.claimNextJob,
      {
        stationKey: typeof body.stationKey === 'string' ? body.stationKey : '',
      },
    )

    return jsonResponse({ job })
  }),
})

http.route({
  path: '/printer-agent/job-started',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!validateStationToken(request)) {
      return unauthorizedResponse()
    }

    const body = await readJsonBody(request)
    const result = await ctx.runMutation(
      internal.printing.mutations.markJobStarted,
      {
        stationKey: typeof body.stationKey === 'string' ? body.stationKey : '',
        jobId: body.jobId as Id<'printJobs'>,
      },
    )

    return jsonResponse(result)
  }),
})

http.route({
  path: '/printer-agent/job-complete',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!validateStationToken(request)) {
      return unauthorizedResponse()
    }

    const body = await readJsonBody(request)
    const result = await ctx.runMutation(
      internal.printing.mutations.markJobComplete,
      {
        stationKey: typeof body.stationKey === 'string' ? body.stationKey : '',
        jobId: body.jobId as Id<'printJobs'>,
      },
    )

    return jsonResponse(result)
  }),
})

http.route({
  path: '/printer-agent/job-failed',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!validateStationToken(request)) {
      return unauthorizedResponse()
    }

    const body = await readJsonBody(request)
    const result = await ctx.runMutation(
      internal.printing.mutations.markJobFailed,
      {
        stationKey: typeof body.stationKey === 'string' ? body.stationKey : '',
        jobId: body.jobId as Id<'printJobs'>,
        failureCode:
          typeof body.failureCode === 'string' ? body.failureCode : undefined,
        failureMessage:
          typeof body.failureMessage === 'string'
            ? body.failureMessage
            : undefined,
      },
    )

    return jsonResponse(result)
  }),
})

http.route({
  path: '/printer-agent/job-document',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!validateStationToken(request)) {
      return unauthorizedResponse()
    }

    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId') as Id<'printJobs'> | null
    if (!jobId) {
      return jsonResponse(
        { error: 'Missing jobId query parameter.' },
        { status: 400 },
      )
    }

    const job = await ctx.runQuery(internal.printing.queries.getJobById, {
      jobId,
    })
    if (!job) {
      return jsonResponse({ error: 'Print job not found.' }, { status: 404 })
    }
    if (job.sourceKind !== 'stored_document' || !job.storageId) {
      return jsonResponse(
        { error: 'Print job does not reference a stored document.' },
        { status: 400 },
      )
    }

    const blob = await ctx.storage.get(job.storageId)
    if (!blob) {
      return jsonResponse(
        { error: 'Stored print document not found.' },
        { status: 404 },
      )
    }

    return new Response(blob, {
      headers: {
        'content-type': job.mimeType || blob.type || 'application/octet-stream',
        'content-disposition': `attachment; filename="${job.fileName ?? `${job._id}.bin`}"`,
      },
    })
  }),
})

export default http
