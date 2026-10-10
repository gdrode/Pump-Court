// Runs on the phone: opens its camera and streams it to the laptop over WebRTC
// (or JPEG frames through the relay). In the Pump Court app, when the round
// ends the laptop stops filming and sends the player's stats: the page then
// shows them, with "Post my score" / "Don't post" (see PhoneNote).
import {
  httpSignal,
  PHONE_FPS,
  RTC_CONFIG,
  type PhoneNote,
  type PhoneRoundStats,
  type PostStatus,
  type ServerMessage,
  type SignalChannel,
  type SignalData,
} from './protocol'

const statusEl = document.getElementById('status')!
const preview = document.getElementById('preview') as HTMLVideoElement
const startBtn = document.getElementById('start') as HTMLButtonElement
const flipBtn = document.getElementById('flip') as HTMLButtonElement
const $ = (id: string) => document.getElementById(id)

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
/** The round is over: the page shows the stats and the link is only used for the post choice. */
let resultMode = false

function status(text: string, kind: '' | 'ok' | 'err' = '') {
  statusEl.textContent = text
  statusEl.className = `host__bubble sketch ${kind === 'ok' ? 'is-good' : kind ? 'is-bad' : ''}`
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
  sentRotation = null
  status('Connecting to the laptop…')
  const me = httpSignal(room, 'phone', (msg: ServerMessage) => {
    if (me !== channel) return // torn down on purpose
    if (msg.type === 'note') return onNote(msg.data)
    if (resultMode) {
      if (msg.type === 'peer-left' || msg.type === 'closed' || msg.type === 'error') linkGone()
      return
    }
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
  sentRotation = null
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
    const msg = JSON.parse(String(e.data)) as { type: string; message?: string; data?: PhoneNote }
    if (msg.type === 'note' && msg.data) onNote(msg.data)
    else if (resultMode) {
      if (msg.type === 'peer-left' || msg.type === 'error') linkGone()
    } else if (msg.type === 'error') teardown(msg.message ?? 'Could not connect.', 'err')
    else if (msg.type === 'peer-left') teardown('The laptop closed this camera. Scan a new code to reconnect.')
  }
  ws.onclose = (e) => {
    if (relay !== ws) return // closed on purpose
    if (resultMode) return linkGone()
    teardown(e.code === 4000 ? 'Another phone took over this code.' : 'Lost the connection to the laptop. Reload to try again.', 'err')
  }
}

// --- Which way up the phone is --------------------------------------------------
// Propped on its side with rotation lock on, the phone keeps sending a portrait
// picture, so the player appears lying sideways. Gravity says how the phone is
// really held (it works with rotation lock on); the laptop turns the picture.
let gravity: { x: number; y: number } | null = null
let sentRotation: number | null = null
window.addEventListener('devicemotion', (e) => {
  const g = e.accelerationIncludingGravity
  if (g?.x != null && g.y != null) gravity = { x: g.x, y: g.y }
})
/** iOS reports gravity with the opposite sign to the web standard. */
const gravitySign = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1

/** Clockwise turn that makes the picture upright, or null when unsure. */
function neededRotation(): number | null {
  if (!gravity || !preview.videoWidth) return null
  const x = gravity.x * gravitySign, y = gravity.y * gravitySign
  const frameLandscape = preview.videoWidth > preview.videoHeight
  if (Math.abs(x) > Math.abs(y) * 1.3) {
    // Held sideways. A landscape picture is already upright (rotation not locked).
    if (frameLandscape) return 0
    return x > 0 ? 90 : 270
  }
  if (Math.abs(y) > Math.abs(x) * 1.3) {
    // Held upright (or upside down).
    if (frameLandscape) return y > 0 ? 270 : 90
    return y > 0 ? 0 : 180
  }
  return null // flat on a table or mid-turn: keep the last answer
}

function sendRotation(rotation: number) {
  if (relayMode) {
    if (relay?.readyState === WebSocket.OPEN) relay.send(JSON.stringify({ type: 'orientation', rotation }))
  } else send({ orientation: rotation })
}

setInterval(() => {
  const r = neededRotation()
  if (r == null || r === sentRotation) return
  if (relayMode ? relay?.readyState !== WebSocket.OPEN : !channel) return
  sentRotation = r
  sendRotation(r)
}, 700)

async function askMotionPermission() {
  // iOS asks before giving motion data; it must be asked from a tap.
  const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined
  try {
    await DM?.requestPermission?.()
  } catch {
    // Declined: the laptop's Rotate button still works.
  }
}

startBtn.onclick = async () => {
  if (!room) return status('Missing pairing code. Scan the QR code on the laptop again.', 'err')
  void askMotionPermission()
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

// --- After the round: the player's stats, and posting them ---------------------

/** Stops filming but keeps the link to the laptop, for the post choice. */
function stopFilming() {
  clearInterval(relayTimer)
  const peer = pc
  pc = null
  peer?.close()
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  preview.srcObject = null
  void wakeLock?.release()
  wakeLock = null
}

/** Shows one of the dragons the build put in the page (wave, cheer, sad) in a host box. */
function setDragon(view: string, action: 'wave' | 'cheer' | 'sad') {
  const host = document.querySelector(`#${view} [data-host]`)
  const art = (document.getElementById(`dragon-${action}`) as HTMLTemplateElement | null)?.content.firstElementChild
  if (!host || !art) return
  host.querySelector('svg')?.remove()
  host.prepend(art.cloneNode(true))
}

function formatTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function showStats(st: PhoneRoundStats) {
  const set = (id: string, text: string | number) => {
    const el = $(id)
    if (el) el.textContent = String(text)
  }
  set('r-mode', st.modeLabel)
  set('r-player', st.player)
  set('r-finish', st.finishText)
  set('r-points', st.points)
  set('r-reps', st.reps)
  set('r-attempts', st.attempts)
  set('r-perfect', st.perfect)
  set('r-time', formatTime(st.durationMs))
  for (const light of ['depth', 'torso', 'lockout'] as const) {
    set(`r-${light}`, st.noReps[light])
    const bar = $(`r-${light}-bar`)
    if (bar) bar.innerHTML = '<i></i>'.repeat(Math.min(st.noReps[light], 40))
  }
  set('say', st.reps === 0 ? 'Every champion starts somewhere!' : st.perfect === st.reps && st.reps > 0 ? 'Flawless form!' : `${st.points} points. Nice work!`)
  setDragon('result-view', st.reps === 0 ? 'sad' : 'cheer')
}

const POST_TEXT: Record<PostStatus, string> = {
  pending: 'Your score is not on the leaderboard yet. Post it?',
  posting: 'Posting…',
  posted: '✓ Posted to the leaderboard!',
  declined: 'Not posted. Only you saw this score.',
  discarded: 'The host discarded this round.',
  failed: 'Could not save the score. Try again.',
}

let postStatus: PostStatus = 'pending'
let rank: number | null = null
let linkClosed = false

function showPostStatus(by?: 'phone' | 'host') {
  const el = $('post-status')!
  let text = POST_TEXT[postStatus]
  if (postStatus === 'posted') text = rank ? `✓ Posted! You're #${rank} on the board.` : text
  if (postStatus === 'posted' && by === 'host') text += ' (posted by the host)'
  if ((postStatus === 'pending' || postStatus === 'failed') && linkClosed) text = 'The laptop has moved on: this score was not posted.'
  el.textContent = text
  el.className = `phone__status is-${postStatus}`
  const open = (postStatus === 'pending' || postStatus === 'failed') && !linkClosed
  $('post-buttons')!.hidden = !open && postStatus !== 'posting'
  for (const id of ['post', 'skip']) ($(id) as HTMLButtonElement).disabled = !open
}

function onNote(note: PhoneNote) {
  if (note.type === 'round-over') {
    resultMode = true
    stopFilming()
    postStatus = note.status
    showStats(note.stats)
    $('camera-view')!.hidden = true
    $('result-view')!.hidden = false
    window.scrollTo(0, 0)
    showPostStatus()
  } else if (note.type === 'post-status') {
    postStatus = note.status
    rank = note.rank
    showPostStatus(note.by)
  }
}

/** The laptop closed the link (after the choice, or it moved on). */
function linkGone() {
  linkClosed = true
  stopRelay()
  channel?.close()
  channel = null
  showPostStatus()
}

function sendChoice(post: boolean) {
  if (relayMode) {
    if (relay?.readyState === WebSocket.OPEN) relay.send(JSON.stringify({ type: 'post', post }))
  } else send({ post })
  postStatus = post ? 'posting' : 'declined'
  showPostStatus()
}
;($('post') as HTMLButtonElement).onclick = () => sendChoice(true)
;($('skip') as HTMLButtonElement).onclick = () => sendChoice(false)
