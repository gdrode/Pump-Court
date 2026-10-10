// Laptop side of a phone camera: waits in a pairing room for the phone's
// WebRTC offer and hands back its video as a MediaStream.
import { RTC_CONFIG, signalUrl, type ServerMessage, type SignalData } from './phone/protocol'

export type PhoneStatus = 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'failed'

export interface PhoneLinkHandlers {
  onStatus(status: PhoneStatus, detail?: string): void
  onStream(stream: MediaStream): void
  /** A phone loaded the pairing page, so it can reach this laptop. */
  onVisit?(from: string): void
  /** The phone says how to turn its picture upright (clockwise degrees). */
  onOrientation?(rotation: number): void
}

export interface PhoneLink {
  room: string
  /** Point status updates somewhere else, e.g. from the pairing dialog to the camera list. */
  setHandlers(h: PhoneLinkHandlers): void
  close(): void
}

export function newRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function openPhoneLink(room: string, handlers: PhoneLinkHandlers): PhoneLink {
  let h = handlers
  let pc: RTCPeerConnection | null = null
  let closed = false
  let chain = Promise.resolve()
  let connected = false
  // Replayed to whoever takes over the link (the pairing dialog hands it to the app).
  let lastOrientation: number | null = null
  // ICE candidates that arrive before the offer has been applied.
  let pending: RTCIceCandidateInit[] = []

  const send = (data: SignalData) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'signal', data }))

  const newPeer = () => {
    pc?.close()
    const peer = new RTCPeerConnection(RTC_CONFIG)
    pc = peer
    peer.onicecandidate = (e) => { if (e.candidate) send({ candidate: e.candidate.toJSON() }) }
    peer.ontrack = (e) => h.onStream(e.streams[0] ?? new MediaStream([e.track]))
    peer.onconnectionstatechange = () => {
      if (peer !== pc || closed) return
      const s = peer.connectionState
      connected = s === 'connected'
      if (s === 'connected') h.onStatus('connected')
      else if (s === 'failed') h.onStatus('failed', 'Could not reach the phone. Put both on the same Wi-Fi or hotspot.')
      else if (s === 'disconnected') h.onStatus('disconnected')
    }
    return peer
  }

  const onSignal = async (data: SignalData) => {
    if ('sdp' in data) {
      if (data.sdp.type !== 'offer') return
      const peer = newPeer()
      await peer.setRemoteDescription(data.sdp)
      await peer.setLocalDescription(await peer.createAnswer())
      send({ sdp: peer.localDescription!.toJSON() })
      for (const c of pending) await peer.addIceCandidate(c).catch(() => {})
      pending = []
    } else if ('orientation' in data) {
      if ([0, 90, 180, 270].includes(data.orientation)) {
        lastOrientation = data.orientation
        h.onOrientation?.(data.orientation)
      }
    } else if ('candidate' in data) {
      if (!pc?.remoteDescription) pending.push(data.candidate)
      else await pc.addIceCandidate(data.candidate).catch(() => {})
    }
  }

  // Opened a tick later, so React's dev-mode mount/unmount/mount doesn't open and drop a socket.
  let ws: WebSocket = null!
  const timer = setTimeout(() => {
    ws = new WebSocket(signalUrl())
    wire()
  }, 0)

  function wire() {
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room, role: 'host' }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMessage
      if (msg.type === 'joined') h.onStatus('waiting')
      else if (msg.type === 'phone-visit') h.onVisit?.(msg.from)
      else if (msg.type === 'peer-joined') h.onStatus('connecting')
      else if (msg.type === 'peer-left') {
        pc?.close()
        pc = null
        connected = false
        h.onStatus('disconnected', 'The phone page was closed or reloaded.')
      }
      else if (msg.type === 'signal') chain = chain.then(() => onSignal(msg.data)).catch((err) => h.onStatus('failed', String(err)))
      else if (msg.type === 'error') h.onStatus('failed', msg.message)
    }
    ws.onclose = () => {
      if (closed) return
      if (connected) h.onStatus('connected', 'The pairing server stopped, so this phone cannot reconnect if it drops.')
      else h.onStatus('failed', 'Lost the pairing server. Is `npm run dev` still running?')
    }
  }

  return {
    room,
    setHandlers(next) {
      h = next
      if (lastOrientation != null) h.onOrientation?.(lastOrientation)
    },
    close() {
      closed = true
      clearTimeout(timer)
      pc?.close()
      ws?.close()
    },
  }
}
