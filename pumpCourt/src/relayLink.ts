// Laptop side of a phone on the internet link: receives the phone's JPEG
// frames from the relay (server/phoneSignal.ts, /relay) and turns them into a
// MediaStream, so the rest of the app treats it like any other camera.
import type { PhoneLink, PhoneLinkHandlers } from './phoneLink'

export function openRelayLink(room: string, handlers: PhoneLinkHandlers): PhoneLink {
  let h = handlers
  let closed = false
  let stream: MediaStream | null = null
  let track: (MediaStreamTrack & { requestFrame?: () => void }) | null = null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  // Keep only the newest frame waiting: if decoding falls behind, older frames are skipped.
  let pending: Blob | null = null
  let decoding = false
  // Frames are arriving from the current phone connection (reset when it drops or reconnects).
  let live = false

  const draw = async () => {
    if (decoding || !pending) return
    decoding = true
    const blob = pending
    pending = null
    try {
      const img = await createImageBitmap(blob)
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width
        canvas.height = img.height
      }
      ctx.drawImage(img, 0, 0)
      img.close()
      if (!stream) {
        // captureStream(0) = a new video frame only when requestFrame() is called, one per phone frame.
        stream = canvas.captureStream(0)
        track = stream.getVideoTracks()[0]
        h.onStream(stream)
      }
      if (!live) {
        live = true
        h.onStatus('connected')
      }
      track?.requestFrame?.()
    } catch {
      // A damaged frame: skip it.
    }
    decoding = false
    if (pending) void draw()
  }

  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay?room=${encodeURIComponent(room)}&role=host`)
  ws.binaryType = 'blob'
  ws.onopen = () => h.onStatus('waiting')
  ws.onmessage = (e) => {
    if (e.data instanceof Blob) {
      pending = e.data
      void draw()
      return
    }
    const msg = JSON.parse(e.data) as { type: string; from?: string; message?: string }
    if (msg.type === 'phone-visit') h.onVisit?.(msg.from ?? '')
    else if (msg.type === 'peer-joined') { live = false; h.onStatus('connecting') }
    else if (msg.type === 'peer-left') { live = false; h.onStatus('disconnected', 'The phone page was closed or lost its connection.') }
  }
  ws.onclose = () => {
    if (!closed) h.onStatus('failed', 'Lost the relay. Is `npm run dev` still running?')
  }

  return {
    room,
    setHandlers(next) { h = next },
    close() {
      closed = true
      ws.close()
      track?.stop()
    },
  }
}
