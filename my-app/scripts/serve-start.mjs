import { createServer } from 'node:http'
import { NodeRequest, sendNodeResponse } from 'srvx/node'

const host = process.env.HOST?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ''}`)
}

const serverEntryUrl = new URL('../dist/server/server.js', import.meta.url)
const serverBuild = (await import(serverEntryUrl.href)).default

createServer(async (req, res) => {
  try {
    const webReq = new NodeRequest({ req, res })
    const webRes = await serverBuild.fetch(webReq)
    await sendNodeResponse(res, webRes)
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}).listen(port, host, () => {
  console.log(`TCG IMS4 listening on http://${host}:${port}`)
})
