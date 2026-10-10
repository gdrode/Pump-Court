// Vite plugin: a tiny WebRTC signaling relay for phone cameras.
//
// The laptop page and the phone page join the same room and this server
// passes their connection offers back and forth; the video itself then flows
// directly from the phone to the laptop over the local network and never
// passes through here.
//
// Two transports reach the same rooms:
//   - WebSocket on /signal (the laptop page).
//   - Plain HTTPS requests on /signal-http/* (the phone page). iPhone Safari
//     often refuses WebSockets to a self-signed certificate even after the
//     warning was accepted, while ordinary requests work, so phones use these.
//
// A third path, /relay, carries the video itself as JPEG frames over a
// WebSocket. It is used only with the internet link (server/tunnel.ts), where
// the phone and laptop can't reach each other directly for WebRTC.
//
// GET /api/lan lists this machine's network addresses (best first) and its
// Bonjour name, so the laptop can show a QR code a phone can reach. Each time
// a phone opens /phone.html for a room, the laptop is told, so it can show
// whether the phone got through at all.
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { hostname, networkInterfaces } from 'node:os'
import type { Duplex } from 'node:stream'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { WebSocketServer, WebSocket } from 'ws'

type Role = 'host' | 'phone'

/** One side of a room, whichever transport it came in on. */
interface Peer {
  send(msg: unknown): void
  close(code: number): void
}
interface Room { host?: Peer; phone?: Peer }

const ROOM_RE = /^[A-Za-z0-9]{4,32}$/
const MAX_BODY = 256 * 1024
/** An HTTP phone that hasn't polled for this long has gone. */
const HTTP_PEER_TIMEOUT_MS = 15_000
/** How long a poll is held open waiting for a message. */
const POLL_HOLD_MS = 20_000
/** Largest JPEG frame the relay accepts (a 960-wide frame is ~60 KB). */
const RELAY_MAX_FRAME = 2 * 1024 * 1024

export interface LanAddress {
  address: string
  iface: string
  /** Why it is ranked where it is, shown to the operator. */
  label: string
}

/**
 * IPv4 addresses a phone might reach, best first: hotspot and Wi-Fi/Ethernet
 * addresses before VPN tunnels and virtual adapters. Link-local addresses
 * (169.254.x.x) are left out: they only appear when a network has no router.
 */
export function lanAddresses(): LanAddress[] {
  const out: (LanAddress & { rank: number })[] = []
  for (const [iface, list] of Object.entries(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family !== 'IPv4' || n.internal || n.address.startsWith('169.254.')) continue
      const virtual = /^(utun|tun|tap|bridge|awdl|llw|vmnet|vboxnet|docker|veth|br-|virbr|zt|tailscale|wg)/i.test(iface)
      const hotspot = n.address.startsWith('172.20.10.') || n.address.startsWith('192.168.43.')
      const label = hotspot ? 'phone hotspot' : virtual ? 'VPN or virtual adapter: phones usually cannot reach this' : iface.startsWith('en') || iface.startsWith('wl') || iface.startsWith('eth') ? 'Wi-Fi or Ethernet' : 'network adapter'
      out.push({ address: n.address, iface, label, rank: hotspot ? 0 : virtual ? 2 : 1 })
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...a }) => a)
}

/** This Mac's Bonjour name (e.g. "Alexs-MacBook.local"), which iPhones resolve without knowing the IP. */
export function bonjourName(): string | null {
  const h = hostname()
  return h.endsWith('.local') ? h : null
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        resolve(null)
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(v && typeof v === 'object' ? v : null)
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
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
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY })
  const rooms = new Map<string, Room>()

  // --- Rooms, shared by both transports ------------------------------------
  /** Joins a peer to a room. Returns an error message, or null on success. */
  const join = (peer: Peer, room: string, role: Role): string | null => {
    const r = rooms.get(room) ?? {}
    // A phone may only join a room the laptop opened.
    if (role === 'phone' && !r.host) return 'This pairing code has expired. Open "Add camera" on the laptop and scan the new code.'
    const old = r[role]
    if (old && old !== peer) old.close(4000)
    r[role] = peer
    rooms.set(room, r)
    peer.send({ type: 'joined' })
    if (r.host && r.phone) {
      r.host.send({ type: 'peer-joined' })
      r.phone.send({ type: 'peer-joined' })
    }
    return null
  }

  const relay = (room: string, role: Role, data: unknown) => {
    const r = rooms.get(room)
    ;(role === 'host' ? r?.phone : r?.host)?.send({ type: 'signal', data })
  }

  const leave = (peer: Peer, room: string, role: Role) => {
    const r = rooms.get(room)
    if (!r || r[role] !== peer) return
    delete r[role]
    ;(role === 'host' ? r.phone : r.host)?.send({ type: 'peer-left' })
    if (!r.host && !r.phone) rooms.delete(room)
  }

  // --- WebSocket transport ---------------------------------------------------
  wss.on('connection', (ws) => {
    let room: string | null = null
    let role: Role | null = null
    const peer: Peer = {
      send: (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) },
      close: (code) => ws.close(code, 'replaced'),
    }
    // Oversize or malformed frames make ws emit 'error' and close the socket;
    // without a listener that error would crash the whole dev server.
    ws.on('error', () => {})

    ws.on('message', (raw) => {
      let msg: { type?: string; room?: string; role?: string; data?: unknown }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'join') {
        if (room || typeof msg.room !== 'string' || !ROOM_RE.test(msg.room) || (msg.role !== 'host' && msg.role !== 'phone')) {
          peer.send({ type: 'error', message: 'bad join' })
          return
        }
        const err = join(peer, msg.room, msg.role)
        if (err) peer.send({ type: 'error', message: err })
        else { room = msg.room; role = msg.role }
        return
      }
      if (msg.type === 'signal' && room && role) relay(room, role, msg.data)
    })

    ws.on('close', () => { if (room && role) leave(peer, room, role) })
  })

  // --- Video relay (internet link) ------------------------------------------
  // Rooms of one laptop and one phone; the phone's binary frames go to the laptop as they are.
  const relayRooms = new Map<string, { host?: WebSocket; phone?: WebSocket }>()
  const relayWss = new WebSocketServer({ noServer: true, maxPayload: RELAY_MAX_FRAME })
  relayWss.on('connection', (ws, req: IncomingMessage) => {
    ws.on('error', () => {})
    const q = new URL(req.url ?? '', 'http://x').searchParams
    const room = q.get('room') ?? '', role = q.get('role')
    const sendText = (to: WebSocket | undefined, msg: unknown) => { if (to?.readyState === WebSocket.OPEN) to.send(JSON.stringify(msg)) }
    if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'phone')) return ws.close(4001, 'bad join')
    const r = relayRooms.get(room) ?? {}
    if (role === 'phone' && !r.host) {
      sendText(ws, { type: 'error', message: 'This pairing code has expired. Open "Add camera" on the laptop and scan the new code.' })
      return ws.close(4002, 'expired')
    }
    r[role]?.close(4000, 'replaced')
    r[role] = ws
    relayRooms.set(room, r)
    if (r.host && r.phone) { sendText(r.host, { type: 'peer-joined' }); sendText(r.phone, { type: 'peer-joined' }) }
    ws.on('message', (data, isBinary) => {
      // Only the phone sends frames; drop them if the laptop is still busy with earlier ones.
      if (role !== 'phone' || !isBinary) return
      const host = relayRooms.get(room)?.host
      if (host?.readyState === WebSocket.OPEN && host.bufferedAmount < RELAY_MAX_FRAME) host.send(data, { binary: true })
    })
    ws.on('close', () => {
      const cur = relayRooms.get(room)
      if (!cur || cur[role] !== ws) return
      delete cur[role]
      sendText(role === 'host' ? cur.phone : cur.host, { type: 'peer-left' })
      if (!cur.host && !cur.phone) relayRooms.delete(room)
    })
  })

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = req.url?.split('?')[0]
    if (path === '/signal') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    else if (path === '/relay') relayWss.handleUpgrade(req, socket, head, (ws) => relayWss.emit('connection', ws, req))
    // anything else is Vite's own HMR socket: leave it alone
  })

  // --- HTTP transport (phones) -----------------------------------------------
  interface HttpPeer extends Peer {
    id: string
    room: string
    role: Role
    queue: unknown[]
    waiting: ServerResponse | null
    holdTimer: ReturnType<typeof setTimeout> | null
    lastSeen: number
    closed: boolean
  }
  const httpPeers = new Map<string, HttpPeer>()

  const flush = (p: HttpPeer) => {
    if (!p.waiting || (!p.queue.length && !p.closed)) return
    const res = p.waiting
    p.waiting = null
    if (p.holdTimer) clearTimeout(p.holdTimer)
    p.holdTimer = null
    json(res, 200, { messages: p.queue.splice(0) })
  }

  const dropHttpPeer = (p: HttpPeer) => {
    if (!httpPeers.has(p.id)) return
    httpPeers.delete(p.id)
    leave(p, p.room, p.role)
  }

  const sweep = setInterval(() => {
    const now = Date.now()
    for (const p of httpPeers.values()) if (!p.waiting && now - p.lastSeen > HTTP_PEER_TIMEOUT_MS) dropHttpPeer(p)
  }, 5000)
  sweep.unref?.()
  httpServer.on('close', () => clearInterval(sweep))

  server.middlewares.use('/signal-http', async (req, res) => {
    const path = (req.url ?? '').split('?')[0]
    if (req.method === 'POST' && path === '/join') {
      const body = await readJson(req)
      const room = body?.room, role = body?.role
      if (typeof room !== 'string' || !ROOM_RE.test(room) || (role !== 'host' && role !== 'phone')) return json(res, 400, { error: 'bad join' })
      const id = crypto.randomUUID()
      const p: HttpPeer = {
        id, room, role, queue: [], waiting: null, holdTimer: null, lastSeen: Date.now(), closed: false,
        send(msg) { this.queue.push(msg); flush(this) },
        close(code) {
          this.closed = true
          this.queue.push({ type: 'closed', code })
          flush(this)
          httpPeers.delete(this.id)
        },
      }
      const err = join(p, room, role)
      if (err) return json(res, 200, { error: err })
      httpPeers.set(id, p)
      return json(res, 200, { id })
    }
    if (req.method === 'GET' && path === '/poll') {
      const id = new URL(req.url ?? '', 'http://x').searchParams.get('id') ?? ''
      const p = httpPeers.get(id)
      if (!p) return json(res, 410, { error: 'gone' })
      p.lastSeen = Date.now()
      if (p.waiting) json(p.waiting, 200, { messages: [] }) // a newer poll replaces an older one
      if (p.holdTimer) clearTimeout(p.holdTimer)
      p.waiting = res
      res.on('close', () => {
        if (p.waiting === res) { p.waiting = null; p.lastSeen = Date.now() }
      })
      if (p.queue.length) return flush(p)
      p.holdTimer = setTimeout(() => {
        if (p.waiting !== res) return
        p.waiting = null
        p.holdTimer = null
        p.lastSeen = Date.now()
        json(res, 200, { messages: [] })
      }, POLL_HOLD_MS)
      return
    }
    if (req.method === 'POST' && (path === '/send' || path === '/leave')) {
      const body = await readJson(req)
      const p = httpPeers.get(typeof body?.id === 'string' ? body.id : '')
      if (!p) return json(res, 410, { error: 'gone' })
      p.lastSeen = Date.now()
      if (path === '/send') relay(p.room, p.role, body?.data)
      else dropHttpPeer(p)
      return json(res, 200, { ok: true })
    }
    json(res, 404, { error: 'not found' })
  })

  // --- Phone visits ---------------------------------------------------------
  // Tell the laptop as soon as a phone loads the page, before it even taps
  // Start: it proves the phone can reach this machine.
  server.middlewares.use((req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?')
    if (path === '/phone.html' && query) {
      const room = new URLSearchParams(query).get('room') ?? ''
      const cf = req.headers['cf-connecting-ip']
      const from = typeof cf === 'string' ? `${cf}, via the internet link` : req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
      rooms.get(room)?.host?.send({ type: 'phone-visit', from })
      const relayHost = relayRooms.get(room)?.host
      if (relayHost?.readyState === WebSocket.OPEN) relayHost.send(JSON.stringify({ type: 'phone-visit', from }))
    }
    next()
  })

  server.middlewares.use('/api/lan', (_req, res) => {
    const addr = httpServer.address()
    const addresses = lanAddresses()
    json(res, 200, {
      ips: addresses.map((a) => a.address),
      addresses,
      bonjour: bonjourName(),
      port: typeof addr === 'object' && addr ? addr.port : null,
    })
  })
}

export function phoneSignal(): Plugin {
  return {
    name: 'pumpcourt-phone-signal',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
