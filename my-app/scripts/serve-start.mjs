import { fileURLToPath } from 'node:url'
import { serve } from 'srvx/node'
import { serveStatic } from 'srvx/static'

const host = process.env.HOST?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ''}`)
}

const serverEntryUrl = new URL('../dist/server/server.js', import.meta.url)
const clientDir = fileURLToPath(new URL('../dist/client/', import.meta.url))
const serverBuild = (await import(serverEntryUrl.href)).default

serve({
  hostname: host,
  port,
  middleware: [serveStatic({ dir: clientDir })],
  fetch: async (request) => {
    try {
      return await serverBuild.fetch(request)
    } catch (error) {
      console.error(error)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
})
