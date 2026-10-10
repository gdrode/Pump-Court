// @vitest-environment node
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { WebSocket } from 'ws'
import { phoneSignal } from '../phoneSignal.ts'
import { tunnel, tunnelAllows, viaTunnel } from '../tunnel.ts'
import type { IncomingMessage } from 'node:http'

let server: ViteDevServer
let base: string

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    plugins: [tunnel(), phoneSignal()],
    server: { port: 0, host: '127.0.0.1', hmr: false, ws: false, watch: null },
    logLevel: 'silent',
  })
  await server.listen()
  base = `127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`
})
afterAll(async () => { await server?.close() })

const open = (role: string, room: string) => new Promise<WebSocket>((res, rej) => {
  const ws = new WebSocket(`ws://${base}/relay?room=${room}&role=${role}`)
  ws.once('open', () => res(ws))
  ws.once('error', rej)
})
const nextMessage = (ws: WebSocket) => new Promise<{ data: Buffer; binary: boolean }>((res) => ws.once('message', (data, binary) => res({ data: data as Buffer, binary })))
const closed = (ws: WebSocket) => new Promise<number>((res) => ws.once('close', (code) => res(code)))

describe('video relay', () => {
  it('a phone without a laptop in the room is told the code expired', async () => {
    const phone = new WebSocket(`ws://${base}/relay?room=NOHOST01&role=phone`)
    const msg = nextMessage(phone), code = closed(phone)
    expect(JSON.parse(String((await msg).data)).message).toMatch(/expired/)
    expect(await code).toBe(4002)
  })

  it('forwards phone frames to the laptop as binary, and says when the phone leaves', async () => {
    const host = await open('host', 'RELAY001')
    const joined = nextMessage(host)
    const phone = await open('phone', 'RELAY001')
    expect(JSON.parse(String((await joined).data)).type).toBe('peer-joined')
    const frame = nextMessage(host)
    phone.send(Buffer.from([0xff, 0xd8, 1, 2, 3]))
    const got = await frame
    expect(got.binary).toBe(true)
    expect([...got.data]).toEqual([0xff, 0xd8, 1, 2, 3])
    const left = nextMessage(host)
    phone.close()
    expect(JSON.parse(String((await left).data)).type).toBe('peer-left')
    host.close()
  })

  it('ignores text and frames sent by the laptop side', async () => {
    const host = await open('host', 'RELAY002')
    const phone = await open('phone', 'RELAY002')
    let phoneGot = 0
    phone.on('message', (_d, binary) => { if (binary) phoneGot++ })
    host.send(Buffer.from([1, 2, 3]))
    await new Promise((r) => setTimeout(r, 150))
    expect(phoneGot).toBe(0)
    host.close(); phone.close()
  })

  it('bad room codes are refused', async () => {
    const ws = await open('host', 'x')
    expect(await closed(ws)).toBe(4001)
  })
})

describe('tunnel guard', () => {
  const req = (headers: Record<string, string>) => ({ headers } as unknown as IncomingMessage)

  it('spots requests that came through the tunnel', () => {
    expect(viaTunnel(req({ host: 'abc-def.trycloudflare.com', 'cf-connecting-ip': '1.2.3.4' }))).toBe(true)
    expect(viaTunnel(req({ host: 'abc-def.trycloudflare.com' }))).toBe(true)
    expect(viaTunnel(req({ host: 'localhost:5173' }))).toBe(false)
    expect(viaTunnel(req({ host: '10.0.0.5:5173' }))).toBe(false)
  })

  it('only lets the phone page and relay through', () => {
    for (const ok of ['/phone.html', '/src/phone/main.ts', '/src/phone/protocol.ts', '/@vite/client', '/relay']) expect(tunnelAllows(ok), ok).toBe(true)
    for (const no of ['/', '/index.html', '/src/App.tsx', '/api/tunnel', '/api/tunnel/start', '/api/lan', '/signal-http/join', '/models/pose_landmarker_full.task', '/@fs/etc/passwd']) expect(tunnelAllows(no), no).toBe(false)
  })

  it('a request via the tunnel cannot reach source files or the tunnel controls', async () => {
    const get = (path: string, headers: Record<string, string> = {}) => fetch(`http://${base}${path}`, { headers })
    const cf = { 'cf-connecting-ip': '203.0.113.9' }
    expect((await get('/api/tunnel', cf)).status).toBe(404)
    expect((await get('/api/lan', cf)).status).toBe(404)
    expect((await get('/api/tunnel')).status).toBe(200) // from this laptop: fine
    const st = (await (await get('/api/tunnel')).json()) as { status: string }
    expect(st.status).toBe('off')
  })
})
