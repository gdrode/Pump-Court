// Messages relayed by server/phoneSignal.ts between the laptop and a phone.

export type ServerMessage =
  | { type: 'joined' }
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'error'; message: string }
  | { type: 'signal'; data: SignalData }
  /** A phone loaded the pairing page: it can reach the laptop. */
  | { type: 'phone-visit'; from: string }
  /** HTTP transport only: the server closed this peer (4000 = another phone took over the code). */
  | { type: 'closed'; code: number }

export type SignalData =
  | { sdp: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit }

export function signalUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`
}

/** LAN only: no STUN/TURN servers, so nothing goes over the internet. */
export const RTC_CONFIG: RTCConfiguration = { iceServers: [] }

export const PHONE_FPS = 30

export interface SignalChannel {
  send(data: SignalData): void
  close(): void
}

/**
 * Signaling over plain HTTPS requests (join, long-poll, send) instead of a
 * WebSocket. iPhone Safari often refuses WebSockets to a self-signed
 * certificate even after the warning was accepted; ordinary requests work.
 */
export function httpSignal(room: string, role: 'host' | 'phone', onMessage: (m: ServerMessage) => void): SignalChannel {
  let id: string | null = null
  let stopped = false
  const outbox: SignalData[] = []

  const post = (path: string, body: unknown) =>
    fetch(`/signal-http/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: path === 'leave' })

  const sendNow = (data: SignalData) => {
    post('send', { id, data }).catch(() => onMessage({ type: 'error', message: 'Lost contact with the laptop.' }))
  }

  async function run() {
    try {
      const r = await (await post('join', { room, role })).json() as { id?: string; error?: string }
      if (stopped) return
      if (!r.id) return onMessage({ type: 'error', message: r.error ?? 'Could not join.' })
      id = r.id
      outbox.splice(0).forEach(sendNow)
    } catch {
      return onMessage({ type: 'error', message: 'Could not reach the laptop.' })
    }
    let failures = 0
    while (!stopped) {
      try {
        const res = await fetch(`/signal-http/poll?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (res.status === 410) return onMessage({ type: 'closed', code: 0 })
        const { messages } = await res.json() as { messages: ServerMessage[] }
        failures = 0
        for (const m of messages) {
          if (stopped) return
          onMessage(m)
          if (m.type === 'closed') return
        }
      } catch {
        // A phone that briefly drops Wi-Fi or locks its screen: retry a few times.
        if (++failures >= 4) return onMessage({ type: 'error', message: 'Lost contact with the laptop.' })
        await new Promise((r) => setTimeout(r, 1000 * failures))
      }
    }
  }
  void run()

  return {
    send(data) {
      if (id) sendNow(data)
      else outbox.push(data)
    },
    close() {
      stopped = true
      if (id) post('leave', { id }).catch(() => {})
    },
  }
}
