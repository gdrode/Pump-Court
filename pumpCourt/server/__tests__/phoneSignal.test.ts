// @vitest-environment node
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { WebSocket } from 'ws'
import { phoneSignal } from '../phoneSignal.ts'

interface Msg { type: string; [k: string]: unknown }

let server: ViteDevServer
let base: string

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    plugins: [phoneSignal()],
    server: { port: 0, host: '127.0.0.1', hmr: false, ws: false, watch: null },
    logLevel: 'silent',
  })
  await server.listen()
  const addr = server.httpServer!.address() as AddressInfo
  base = `127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await server?.close()
})

/** A client that buffers every message so tests can await them in order. */
class Client {
  ws: WebSocket
  private queue: Msg[] = []
  private waiters: ((m: Msg) => void)[] = []
  closed: Promise<{ code: number; reason: string }>

  constructor(path = '/signal') {
    this.ws = new WebSocket(`ws://${base}${path}`)
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as Msg
      const w = this.waiters.shift()
      if (w) w(m)
      else this.queue.push(m)
    })
    this.closed = new Promise((res) => this.ws.on('close', (code, reason) => res({ code, reason: String(reason) })))
  }

  open() {
    return new Promise<void>((res, rej) => {
      if (this.ws.readyState === WebSocket.OPEN) return res()
      this.ws.once('open', () => res())
      this.ws.once('error', rej)
    })
  }

  next(timeout = 1000): Promise<Msg> {
    const q = this.queue.shift()
    if (q) return Promise.resolve(q)
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1)
        rej(new Error('timed out waiting for message'))
      }, timeout)
      const w = (m: Msg) => { clearTimeout(t); res(m) }
      this.waiters.push(w)
    })
  }

  /** Resolves true if no message arrives within `ms`. */
  async silent(ms = 150) {
    try {
      const m = await this.next(ms)
      this.queue.unshift(m)
      return false
    } catch {
      return true
    }
  }

  send(msg: unknown) {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  async join(room: string, role: 'host' | 'phone') {
    await this.open()
    this.send({ type: 'join', room, role })
  }

  close() {
    this.ws.close()
    return this.closed
  }
}

let roomN = 0
const newRoom = () => `room${Date.now().toString(36)}${roomN++}`

async function pair() {
  const room = newRoom()
  const host = new Client()
  await host.join(room, 'host')
  expect(await host.next()).toEqual({ type: 'joined' })
  const phone = new Client()
  await phone.join(room, 'phone')
  expect(await phone.next()).toEqual({ type: 'joined' })
  expect(await host.next()).toEqual({ type: 'peer-joined' })
  expect(await phone.next()).toEqual({ type: 'peer-joined' })
  return { room, host, phone }
}

/** Server still works: a fresh host can join. */
async function serverAlive() {
  const c = new Client()
  await c.join(newRoom(), 'host')
  expect(await c.next()).toEqual({ type: 'joined' })
  await c.close()
}

describe('phoneSignal relay', () => {
  it('host join -> joined', async () => {
    const host = new Client()
    await host.join(newRoom(), 'host')
    expect(await host.next()).toEqual({ type: 'joined' })
    expect(await host.silent()).toBe(true)
    await host.close()
  })

  it('phone joining an unknown room -> error, and it can retry once the host opens it', async () => {
    const room = newRoom()
    const phone = new Client()
    await phone.join(room, 'phone')
    const m = await phone.next()
    expect(m.type).toBe('error')
    expect(typeof m.message).toBe('string')

    const host = new Client()
    await host.join(room, 'host')
    expect(await host.next()).toEqual({ type: 'joined' })
    phone.send({ type: 'join', room, role: 'phone' })
    expect(await phone.next()).toEqual({ type: 'joined' })
    expect(await host.next()).toEqual({ type: 'peer-joined' })
    await phone.close()
    await host.close()
  })

  it('host + phone -> both get peer-joined', async () => {
    const { host, phone } = await pair()
    await phone.close()
    await host.close()
  })

  it('relays signal both directions and not to other rooms', async () => {
    const a = await pair()
    const b = await pair()

    a.host.send({ type: 'signal', data: { sdp: 'offer-a' } })
    expect(await a.phone.next()).toEqual({ type: 'signal', data: { sdp: 'offer-a' } })

    a.phone.send({ type: 'signal', data: { candidate: 'c1' } })
    expect(await a.host.next()).toEqual({ type: 'signal', data: { candidate: 'c1' } })

    expect(await b.host.silent()).toBe(true)
    expect(await b.phone.silent()).toBe(true)
    // Not echoed back to the sender either.
    expect(await a.host.silent()).toBe(true)
    expect(await a.phone.silent()).toBe(true)

    for (const c of [a.host, a.phone, b.host, b.phone]) await c.close()
  })

  it('signal before joining is ignored', async () => {
    const { host, phone } = await pair()
    const stranger = new Client()
    await stranger.open()
    stranger.send({ type: 'signal', data: 'x' })
    expect(await host.silent()).toBe(true)
    expect(await phone.silent()).toBe(true)
    await stranger.close()
    await phone.close()
    await host.close()
  })

  it('phone close -> host gets peer-left', async () => {
    const { host, phone } = await pair()
    await phone.close()
    expect(await host.next()).toEqual({ type: 'peer-left' })
    await host.close()
  })

  it('host close -> phone gets peer-left', async () => {
    const { host, phone } = await pair()
    await host.close()
    expect(await phone.next()).toEqual({ type: 'peer-left' })
    await phone.close()
  })

  it('a second phone in the same room replaces the first (close 4000) without a spurious peer-left', async () => {
    const { room, host, phone } = await pair()
    const phone2 = new Client()
    await phone2.join(room, 'phone')
    expect(await phone2.next()).toEqual({ type: 'joined' })
    const closed = await phone.closed
    expect(closed.code).toBe(4000)
    expect(closed.reason).toBe('replaced')
    expect(await host.next()).toEqual({ type: 'peer-joined' })
    expect(await phone2.next()).toEqual({ type: 'peer-joined' })
    // The replaced phone's close must not tell the host its peer left.
    expect(await host.silent()).toBe(true)

    host.send({ type: 'signal', data: 'to-new-phone' })
    expect(await phone2.next()).toEqual({ type: 'signal', data: 'to-new-phone' })
    await phone2.close()
    expect(await host.next()).toEqual({ type: 'peer-left' })
    await host.close()
  })

  it('a second host in the same room replaces the first (close 4000)', async () => {
    const room = newRoom()
    const h1 = new Client()
    await h1.join(room, 'host')
    expect(await h1.next()).toEqual({ type: 'joined' })
    const h2 = new Client()
    await h2.join(room, 'host')
    expect(await h2.next()).toEqual({ type: 'joined' })
    expect((await h1.closed).code).toBe(4000)
    await h2.close()
  })

  it('rejects invalid room codes, roles and double joins with error', async () => {
    const c = new Client()
    await c.open()
    for (const bad of [
      { type: 'join', room: 'ab', role: 'host' }, // too short
      { type: 'join', room: 'x'.repeat(33), role: 'host' }, // too long
      { type: 'join', room: 'has space', role: 'host' },
      { type: 'join', room: '../etc', role: 'host' },
      { type: 'join', room: 1234, role: 'host' },
      { type: 'join', role: 'host' },
      { type: 'join', room: 'goodroom', role: 'admin' },
      { type: 'join', room: 'goodroom' },
    ]) {
      c.send(bad)
      expect((await c.next()).type).toBe('error')
    }
    const room = newRoom()
    c.send({ type: 'join', room, role: 'host' })
    expect(await c.next()).toEqual({ type: 'joined' })
    c.send({ type: 'join', room: newRoom(), role: 'host' })
    expect((await c.next()).type).toBe('error')
    await c.close()
    await serverAlive()
  })

  it('bad JSON and non-object messages are ignored without crashing', async () => {
    const c = new Client()
    await c.open()
    for (const junk of ['{not json', '', '42', '"str"', '[]', '{}', '{"type":"bogus"}', '{"type":"signal"}']) c.send(junk)
    expect(await c.silent()).toBe(true)
    expect(c.ws.readyState).toBe(WebSocket.OPEN)
    c.send({ type: 'join', room: newRoom(), role: 'host' })
    expect(await c.next()).toEqual({ type: 'joined' })
    await c.close()
    await serverAlive()
  })

  it('a JSON null message is ignored without crashing', async () => {
    const c = new Client()
    await c.open()
    c.send('null')
    expect(await c.silent()).toBe(true)
    c.send({ type: 'join', room: newRoom(), role: 'host' })
    expect(await c.next()).toEqual({ type: 'joined' })
    await c.close()
    await serverAlive()
  })

  it('an oversize payload closes only that socket (1009) and the server keeps working', async () => {
    const { host, phone } = await pair()
    host.send({ type: 'signal', data: 'x'.repeat(300 * 1024) })
    const closed = await host.closed
    expect(closed.code).toBe(1009)
    expect(await phone.next()).toEqual({ type: 'peer-left' })
    await phone.close()
    await serverAlive()
  })

  it('ignores upgrades on other paths', async () => {
    const c = new Client('/not-signal')
    const outcome = await new Promise<string>((res) => {
      c.ws.once('open', () => res('open'))
      c.ws.once('error', () => res('error'))
      c.ws.once('close', () => res('close'))
      setTimeout(() => res('timeout'), 1000)
    })
    expect(outcome).not.toBe('open')
    c.ws.terminate()
    await serverAlive()
  })

  it('accepts /signal with a query string', async () => {
    const c = new Client('/signal?x=1')
    await c.join(newRoom(), 'host')
    expect(await c.next()).toEqual({ type: 'joined' })
    await c.close()
  })
})

describe('GET /api/lan', () => {
  it('returns JSON with an ips array and the port', async () => {
    const res = await fetch(`http://${base}/api/lan`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { ips: unknown; port: unknown }
    expect(Array.isArray(body.ips)).toBe(true)
    for (const ip of body.ips as unknown[]) expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    expect(body.port).toBe(Number(base.split(':')[1]))
  })
})
