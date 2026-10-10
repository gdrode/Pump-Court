// Runs on the phone: opens its camera and streams it to the laptop over WebRTC.
import { httpSignal, PHONE_FPS, RTC_CONFIG, type ServerMessage, type SignalChannel, type SignalData } from './protocol'

const statusEl = document.getElementById('status')!
const preview = document.getElementById('preview') as HTMLVideoElement
const startBtn = document.getElementById('start') as HTMLButtonElement
const flipBtn = document.getElementById('flip') as HTMLButtonElement

const room = new URLSearchParams(location.search).get('room') ?? ''
/** 'relay' when opened through the internet link: frames go through the server instead of WebRTC. */
const relayMode = new URLSearchParams(location.search).get('mode') === 'relay'
let facing: 'environment' | 'user' = 'environment'
let stream: MediaStream | null = null
let pc: RTCPeerConnection | null = null
let channel: SignalChannel | null = null
let wakeLock: { release(): Promise<void> } | null = null
let relay: WebSocket | null = null
let relayTimer = 0
// ICE candidates that arrive before the laptop's answer, applied once it lands.
let pendingCandidates: RTCIceCandidateInit[] = []

function status(text: string, kind: '' | 'ok' | 'err' = '') {
  statusEl.textContent = text
  statusEl.className = kind
}

async function openCamera() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: PHONE_FPS } },
  })
  const track = stream.getVideoTracks()[0]
  // Tell the encoder this is fast motion: keep the frame rate, drop detail first.
  track.contentHint = 'motion'
  preview.srcObject = stream
}

function send(data: SignalData) {
  channel?.send(data)
}

async function startPeer() {
  pc?.close()
  pc = new RTCPeerConnection(RTC_CONFIG)
  const peer = pc
  for (const track of stream!.getTracks()) peer.addTrack(track, stream!)
  peer.onicecandidate = (e) => { if (e.candidate) send({ candidate: e.candidate.toJSON() }) }
  peer.onconnectionstatechange = () => {
    if (peer !== pc) return
    const s = peer.connectionState
    if (s === 'connected') status('Streaming to the laptop', 'ok')
    else if (s === 'failed') status('Connection failed. Are the phone and laptop on the same Wi-Fi?', 'err')
    else if (s === 'disconnected') status('Connection lost, waiting…')
  }
  pendingCandidates = []
  const offer = await peer.createOffer()
  await peer.setLocalDescription(offer)
  // Send the offer before anything else, so it reaches the laptop ahead of the ICE candidates.
  send({ sdp: peer.localDescription!.toJSON() })
  await tuneSender(peer)
}

/** Stop filming and go back to the Start screen. */
function teardown(message: string, kind: '' | 'err' = '') {
  stopRelay()
  const peer = pc
  pc = null
  peer?.close()
  channel?.close()
  channel = null
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  preview.srcObject = null
  void wakeLock?.release()
  wakeLock = null
  startBtn.hidden = false
  flipBtn.hidden = true
  status(message, kind)
}

/** Prefer frame rate over sharpness: fast reps need every frame. */
async function tuneSender(peer: RTCPeerConnection) {
  const sender = peer.getSenders().find((s) => s.track?.kind === 'video')
  if (!sender) return
  try {
    const params = sender.getParameters()
    params.degradationPreference = 'maintain-framerate'
    if (!params.encodings?.length) params.encodings = [{}]
    params.encodings[0].maxBitrate = 4_000_000
    params.encodings[0].maxFramerate = PHONE_FPS
    await sender.setParameters(params)
  } catch {
    // Not every browser supports these; the stream still works without them.
  }
}

let chain = Promise.resolve()
async function onSignal(data: SignalData) {
  if (!pc) return
  if ('sdp' in data) {
    await pc.setRemoteDescription(data.sdp)
    for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {})
    pendingCandidates = []
  } else if ('candidate' in data) {
    if (!pc.remoteDescription) pendingCandidates.push(data.candidate)
    else await pc.addIceCandidate(data.candidate).catch(() => {})
  }
}

function connect() {
  status('Connecting to the laptop…')
  const me = httpSignal(room, 'phone', (msg: ServerMessage) => {
    if (me !== channel) return // torn down on purpose
    if (msg.type === 'peer-joined') chain = chain.then(startPeer).catch((err) => status(String(err), 'err'))
    else if (msg.type === 'signal') chain = chain.then(() => onSignal(msg.data)).catch(() => {})
    else if (msg.type === 'peer-left') teardown('The laptop closed this camera. Scan a new code to reconnect.')
    else if (msg.type === 'closed') teardown(msg.code === 4000 ? 'Another phone took over this code.' : 'The laptop closed this camera. Scan a new code to reconnect.', 'err')
    else if (msg.type === 'error') {
      // Video already flowing goes straight to the laptop and survives losing the relay.
      if (pc?.connectionState === 'connected') return
      teardown(msg.message, 'err')
    }
  })
  channel = me
}

async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null
  } catch {
    // Wake lock is optional.
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && stream) keepAwake()
})

// --- Internet link: JPEG frames over a WebSocket through the relay ----------
/** Frame width sent through the relay: enough for pose tracking, small enough for a phone's upload. */
const RELAY_WIDTH = 640
const RELAY_QUALITY = 0.6
/** Skip a frame when this much is still waiting to be sent: keeps the delay down on a slow connection. */
const RELAY_BACKLOG = 256 * 1024

function stopRelay() {
  clearInterval(relayTimer)
  const ws = relay
  relay = null
  ws?.close()
}

function connectRelay() {
  status('Connecting to the laptop over the internet…')
  const ws = new WebSocket(`wss://${location.host}/relay?room=${encodeURIComponent(room)}&role=phone`)
  relay = ws
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  let busy = false
  const sendFrame = () => {
    if (relay !== ws || ws.readyState !== WebSocket.OPEN || busy || ws.bufferedAmount > RELAY_BACKLOG || !preview.videoWidth) return
    canvas.width = RELAY_WIDTH
    canvas.height = Math.round((RELAY_WIDTH * preview.videoHeight) / preview.videoWidth)
    ctx.drawImage(preview, 0, 0, canvas.width, canvas.height)
    busy = true
    canvas.toBlob((blob) => {
      busy = false
      if (blob && relay === ws && ws.readyState === WebSocket.OPEN) ws.send(blob)
    }, 'image/jpeg', RELAY_QUALITY)
  }
  ws.onopen = () => {
    status('Streaming to the laptop (internet link)', 'ok')
    relayTimer = window.setInterval(sendFrame, 1000 / PHONE_FPS)
  }
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as { type: string; message?: string }
    if (msg.type === 'error') teardown(msg.message ?? 'Could not connect.', 'err')
    else if (msg.type === 'peer-left') teardown('The laptop closed this camera. Scan a new code to reconnect.')
  }
  ws.onclose = (e) => {
    if (relay !== ws) return // closed on purpose
    teardown(e.code === 4000 ? 'Another phone took over this code.' : 'Lost the connection to the laptop. Reload to try again.', 'err')
  }
}

startBtn.onclick = async () => {
  if (!room) return status('Missing pairing code. Scan the QR code on the laptop again.', 'err')
  if (!window.isSecureContext || !navigator.mediaDevices) return status('The camera needs https. Open the exact link from the QR code.', 'err')
  try {
    await openCamera()
  } catch (err) {
    return status(`Camera blocked: ${(err as Error).message}`, 'err')
  }
  startBtn.hidden = true
  flipBtn.hidden = false
  keepAwake()
  if (relayMode) connectRelay()
  else connect()
}

flipBtn.onclick = async () => {
  facing = facing === 'environment' ? 'user' : 'environment'
  try {
    await openCamera()
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video')
    await sender?.replaceTrack(stream!.getVideoTracks()[0])
  } catch (err) {
    status(`Could not flip: ${(err as Error).message}`, 'err')
  }
}

// Closing or reloading the page tells the laptop straight away (a keepalive request), instead of after the poll timeout.
window.addEventListener('pagehide', () => {
  void wakeLock?.release()
  channel?.close()
  pc?.close()
  stopRelay()
})
