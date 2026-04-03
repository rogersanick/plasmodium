import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 5177)

async function serveStatic(urlPath, res) {
  const requestedPath = path.resolve(publicDir, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''))
  if (!requestedPath.startsWith(publicDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  const ext = path.extname(requestedPath)
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  }

  try {
    const data = await readFile(requestedPath)
    const contentType = types[ext] ?? 'application/octet-stream'
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': ext === '.html' ? 'no-store' : 'no-cache, no-store, must-revalidate'
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  await serveStatic(url.pathname, res)
})

server.listen(port, host, () => {
  console.log(`Plasmodium static dev server on http://${host}:${port}`)
})
