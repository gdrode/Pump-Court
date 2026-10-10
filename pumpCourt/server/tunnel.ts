// Vite plugin: an optional Cloudflare quick tunnel for phones that can't reach
// the laptop over the local network (venue Wi-Fi often blocks devices from
// seeing each other). It gives the dev server a public https address with a
// real certificate, so any phone on any network (even cellular) can open the
// pairing page with no warning.
//
// Off until the operator turns it on (POST /api/tunnel/start). While it runs,
// video from a phone using it passes through Cloudflare, encrypted and not
// stored. Requests arriving through the tunnel may only reach the phone page
// and the video relay; everything else (source files, the tunnel controls) is
// refused.
//
//   GET  /api/tunnel        -> { status: 'off'|'starting'|'on'|'error'|'missing', url?, error? }
//   POST /api/tunnel/start  -> starts it (no-op if running)
//   POST /api/tunnel/stop
import { spawn, type ChildProcess } from 'node:child_process'
import { Resolver } from 'node:dns/promises'
import { existsSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Server as TlsServer } from 'node:tls'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

type Status = 'off' | 'starting' | 'on' | 'error' | 'missing'

/** Paths a visitor through the tunnel may load: the phone page, its code, Vite's client and the relay. */
const TUNNEL_ALLOWED = [/^\/phone\.html$/, /^\/src\/phone\//, /^\/@vite\//, /^\/node_modules\/vite\/dist\/client\//, /^\/relay$/, /^\/favicon\.svg$/]

/** True when a request came in through the Cloudflare tunnel rather than from this laptop or the LAN. */
export function viaTunnel(req: IncomingMessage) {
  return typeof req.headers['cf-connecting-ip'] === 'string' || /\.trycloudflare\.com(:\d+)?$/i.test(req.headers.host ?? '')
}

export function tunnelAllows(path: string) {
  return TUNNEL_ALLOWED.some((re) => re.test(path))
}

function findCloudflared() {
  for (const p of ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared']) if (existsSync(p)) return p
  return 'cloudflared' // rely on PATH
}

/**
 * cloudflared prints its address a few seconds before the name resolves on the
 * internet; a phone scanning that early gets "server not found". Wait until
 * public DNS (what phones use) knows the name, up to 45 s. The system resolver
 * is avoided on purpose: asking it too early caches "not found" on this Mac.
 */
async function waitUntilReachable(base: string, stillWanted: () => boolean) {
  const host = new URL(base).hostname
  const resolver = new Resolver({ timeout: 3000, tries: 1 })
  resolver.setServers(['1.1.1.1', '8.8.8.8'])
  for (let i = 0; i < 45 && stillWanted(); i++) {
    try {
      if ((await resolver.resolve4(host)).length) {
        await new Promise((r) => setTimeout(r, 1500)) // let the edge finish routing to this tunnel
        return true
      }
    } catch {
      // not published yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function attach(server: ViteDevServer | PreviewServer) {
  const httpServer = server.httpServer as Server | null
  if (!httpServer) return
  let proc: ChildProcess | null = null
  let status: Status = 'off'
  let url: string | null = null
  let error: string | null = null

  const stop = () => {
    proc?.kill()
    proc = null
    status = 'off'
    url = null
  }
  httpServer.on('close', stop)
  process.once('exit', stop)

  const start = () => {
    if (proc) return
    const addr = httpServer.address()
    const port = typeof addr === 'object' && addr ? addr.port : 5173
    const https = httpServer instanceof TlsServer
    status = 'starting'
    url = null
    error = null
    // --no-tls-verify: the dev server's own certificate is self-signed; Cloudflare's edge has a real one.
    const child = spawn(findCloudflared(), ['tunnel', '--no-autoupdate', '--url', `${https ? 'https' : 'http'}://127.0.0.1:${port}`, '--no-tls-verify'], { stdio: ['ignore', 'pipe', 'pipe'] })
    proc = child
    let found = false
    const onData = (buf: Buffer) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString())
      if (!m || found || proc !== child) return
      found = true
      void waitUntilReachable(m[0], () => proc === child).then((ok) => {
        if (proc !== child) return
        if (ok) {
          url = m[0]
          status = 'on'
        } else {
          status = 'error'
          error = 'The internet link started but never became reachable.'
        }
      })
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (proc !== child) return
      proc = null
      status = err.code === 'ENOENT' ? 'missing' : 'error'
      error = err.code === 'ENOENT' ? 'cloudflared is not installed. Run: brew install cloudflared' : err.message
    })
    child.on('exit', (code) => {
      if (proc !== child) return
      proc = null
      status = 'error'
      url = null
      error = `The internet link stopped (cloudflared exited with ${code}).`
    })
  }

  // Runs before every other middleware: visitors through the tunnel only get the phone page and the relay.
  server.middlewares.use((req, res, next) => {
    if (!viaTunnel(req)) return next()
    const path = (req.url ?? '').split('?')[0]
    if (tunnelAllows(path)) return next()
    res.statusCode = 404
    res.end('Not found')
  })

  server.middlewares.use('/api/tunnel', (req, res) => {
    const path = (req.url ?? '').split('?')[0]
    if (req.method === 'POST' && path === '/start') start()
    else if (req.method === 'POST' && path === '/stop') stop()
    else if (req.method !== 'GET' || (path !== '/' && path !== '')) return json(res, 404, { error: 'not found' })
    json(res, 200, { status, url, error })
  })
}

export function tunnel(): Plugin {
  return {
    name: 'pumpcourt-tunnel',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
