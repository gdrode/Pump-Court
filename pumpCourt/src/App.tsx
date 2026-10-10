import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AddCameraDialog } from './AddCameraDialog'
import { listCameras, loadSavedCameraId } from './camera'
import { Diagnostics } from './Diagnostics'
import { addRep, countdownLeft, createGame, endGame, failLeft, FINISH_TEXT, tick, winner, type GameState, type Mode, type PlayerLive, type Players } from './game'
import { DIFFICULTY, lightStates, RepJudge, type RepResult } from './judge'
import { GameBar, PlayerStage, Results } from './Judging'
import type { PhoneLink, PhoneStatus } from './phoneLink'
import { POSTURE_MESSAGE } from './posture'
import { Setup, type CameraOption } from './Setup'
import { beep, buzzer, ding, unlockAudio } from './sfx'
import { useLane, type Lane, type LaneFrame, type Rotation, type SourceKey } from './useLane'

interface PhoneCamera {
  id: string
  label: string
  stream: MediaStream
  link: PhoneLink
  status: PhoneStatus
  detail: string
  /** Paired through the internet link (server/tunnel.ts) rather than the local network. */
  viaInternet: boolean
  /** The phone's own idea of how to turn its picture upright (from its tilt sensor). */
  rotationHint: Rotation | null
}

const PHONE_STATUS_TEXT: Record<PhoneStatus, string> = {
  waiting: 'is waiting to pair',
  connecting: 'is connecting',
  connected: 'is connected',
  disconnected: 'has disconnected',
  failed: 'was lost',
}

/** The game is always judged on Hard. */
const THRESHOLDS = DIFFICULTY.hard

/** How long the lights stay lit after a rep before going dark again. */
const LIGHTS_HOLD_MS = 2500
/** How long "GO!" stays on screen after the countdown. */
const GO_MS = 800
const TICK_MS = 100

const NOT_LIVE: PlayerLive = { ready: false, inRep: false }
/** Show "Keep going!" this long before a player would fail. */
const FAIL_WARN_MS = 3000

export default function App() {
  // --- Cameras (shared by both players) ----------------------------------------
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [phones, setPhones] = useState<PhoneCamera[]>([])
  // Only goes up, so a removed phone's name is never reused.
  const [phoneNumber, setPhoneNumber] = useState(1)
  /** Which player's "+ Add camera" opened the dialog. */
  const [addingFor, setAddingForState] = useState<number | null>(null)
  const addingForRef = useRef<number | null>(null)
  const setAddingFor = (i: number | null) => {
    addingForRef.current = i
    setAddingForState(i)
  }
  const [deviceError, setDeviceError] = useState<string | null>(null)

  // --- Setup -------------------------------------------------------------------
  const [screen, setScreen] = useState<'setup' | 'play'>('setup')
  const [players, setPlayers] = useState<Players>(1)
  const [mode, setMode] = useState<Mode>('sprint')
  /** Rotation picked with the Rotate button, per player; null = automatic (the phone's hint, else none). */
  const [manualRotation, setManualRotation] = useState<(Rotation | null)[]>([null, null])
  const [sources, setSources] = useState<(SourceKey | null)[]>(() => {
    const saved = loadSavedCameraId()
    return [saved ? `dev:${saved}` : null, null]
  })

  // --- Game --------------------------------------------------------------------
  const [game, setGame] = useState<GameState | null>(null)
  const gameRef = useRef<GameState | null>(null)
  useEffect(() => { gameRef.current = game }, [game])
  const [now, setNow] = useState(() => performance.now())
  const judges = useRef<(RepJudge | null)[]>([null, null])
  const live = useRef<PlayerLive[]>([NOT_LIVE, NOT_LIVE])
  /** Copy of live[i].inRep taken on each clock tick, for rendering. */
  const [liveInRep, setLiveInRep] = useState([false, false])
  const [lastRep, setLastRep] = useState<(RepResult | null)[]>([null, null])
  const [lit, setLit] = useState([false, false])
  const litTimers = useRef([0, 0])
  const diagSink = useRef<((f: LaneFrame) => void) | null>(null)

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await listCameras())
    } catch (err) {
      setDeviceError(String(err))
    }
  }, [])
  useEffect(() => {
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const phoneFor = (key: SourceKey | null) => (key?.startsWith('phone:') ? phones.find((p) => `phone:${p.id}` === key) ?? null : null)

  // --- Each player's frames ---------------------------------------------------
  const onRep = (i: number, rep: RepResult, ts: number) => {
    setGame((g) => (g ? addRep(g, i, rep, ts) : g))
    setLastRep((l) => l.map((x, j) => (j === i ? rep : x)))
    setLit((l) => l.map((x, j) => (j === i ? true : x)))
    clearTimeout(litTimers.current[i])
    litTimers.current[i] = window.setTimeout(() => setLit((l) => l.map((x, j) => (j === i ? false : x))), LIGHTS_HOLD_MS)
    if (rep.counted) ding(rep.perfect)
    else buzzer()
  }
  const onRepRef = useRef(onRep)
  useEffect(() => { onRepRef.current = onRep })

  const handleFrame = useCallback((i: number, f: LaneFrame) => {
    const judge = judges.current[i]
    live.current[i] = { ready: f.posture.ready, inRep: !!judge && judge.currentPhase !== 'top' }
    if (i === 0) diagSink.current?.(f)
    const g = gameRef.current
    if (!judge || g?.phase !== 'running' || g.players[i]?.finished) return
    const a = f.angles
    const rep = judge.push(f.ts, a && {
      elbow: a.elbow,
      hip: a.abdomen,
      knee: a.knee,
      bodyOffset: a.bodyOffset,
      depth: f.posture.height,
      shoulderY: a.shoulderY,
      ready: f.posture.ready,
    })
    if (rep) onRepRef.current(i, rep, f.ts)
  }, [])
  const frame0 = useCallback((f: LaneFrame) => handleFrame(0, f), [handleFrame])
  const frame1 = useCallback((f: LaneFrame) => handleFrame(1, f), [handleFrame])

  const rotationFor = (i: number): Rotation => manualRotation[i] ?? phoneFor(sources[i])?.rotationHint ?? 0
  const lane0 = useLane({ slot: 0, enabled: true, source: sources[0], openDefault: true, phoneStream: phoneFor(sources[0])?.stream ?? null, onFrame: frame0, onCameraOpened: refreshDevices, rotation: rotationFor(0) })
  const lane1 = useLane({ slot: 1, enabled: players === 2, source: sources[1], openDefault: false, phoneStream: phoneFor(sources[1])?.stream ?? null, onFrame: frame1, onCameraOpened: refreshDevices, rotation: rotationFor(1) })
  const lanes: Lane[] = [lane0, lane1].slice(0, players)

  // --- Clock -------------------------------------------------------------------
  const running = screen === 'play' && !!game && game.phase !== 'finished'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const t = performance.now()
      setNow(t)
      setLiveInRep(live.current.map((l) => l.inRep))
      setGame((g) => (g ? tick(g, t, g.players.map((_, i) => live.current[i] ?? NOT_LIVE)) : g))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running])

  // Judges start fresh when the clock starts and stop when the round ends.
  const phase = game?.phase
  useEffect(() => {
    if (phase === 'running') {
      judges.current = [0, 1].map((i) => (i < players ? new RepJudge(THRESHOLDS) : null))
      beep(true)
    } else {
      judges.current = [null, null]
      if (phase === 'finished') beep(true)
    }
  }, [phase, players])

  const cd = game && screen === 'play' ? countdownLeft(game, now) : 0
  useEffect(() => { if (cd > 0) beep(false) }, [cd])

  // --- Actions -----------------------------------------------------------------
  const startGame = () => {
    unlockAudio()
    live.current = [NOT_LIVE, NOT_LIVE]
    setLastRep([null, null])
    setLit([false, false])
    setNow(performance.now())
    setGame(createGame(mode, players))
    setScreen('play')
  }
  const stopGame = () => setGame((g) => (g ? endGame(g, performance.now()) : g))
  const backToSetup = () => {
    setGame(null)
    setScreen('setup')
  }

  const chooseSource = (i: number, key: SourceKey | null) => {
    setSources((s) => s.map((x, j): SourceKey | null => (j === i ? key : x)))
    setManualRotation((m) => m.map((x, j) => (j === i ? null : x))) // a new camera starts on automatic
  }
  const rotate = (i: number) =>
    setManualRotation((m) => m.map((x, j) => (j === i ? (((rotationFor(i) + 90) % 360) as Rotation) : x)))
  const autoRotate = (i: number) => setManualRotation((m) => m.map((x, j) => (j === i ? null : x)))
  // Rotating is allowed until the clock starts (setup and while waiting for players).
  const canRotate = screen === 'setup' || game?.phase === 'waiting'

  const onPhone = useCallback((p: { id: string; label: string; stream: MediaStream; link: PhoneLink; viaInternet?: boolean }) => {
    const setStatus = (status: PhoneStatus, detail?: string) =>
      setPhones((list) => list.map((x) => (x.id === p.id ? { ...x, status, detail: detail ?? '' } : x)))
    // If the phone page reloads it reconnects with a new stream.
    const setStream = (stream: MediaStream) =>
      setPhones((list) => list.map((x) => (x.id === p.id ? { ...x, stream } : x)))
    const setHint = (r: number) =>
      setPhones((list) => list.map((x) => (x.id === p.id ? { ...x, rotationHint: r as Rotation } : x)))
    setPhones((list) => [...list, { ...p, status: 'connected', detail: '', viaInternet: !!p.viaInternet, rotationHint: null }])
    p.link.setHandlers({ onStatus: setStatus, onStream: setStream, onOrientation: setHint })
    setPhoneNumber((n) => n + 1)
    // The phone becomes the camera of the player whose "+ Add camera" was pressed.
    const i = addingForRef.current
    if (i != null) setSources((s) => s.map((x, j): SourceKey | null => (j === i ? `phone:${p.id}` : x)))
    addingForRef.current = null
    setAddingForState(null)
  }, [])

  const removePhone = (id: string) => {
    const p = phones.find((x) => x.id === id)
    p?.link.close()
    p?.stream.getTracks().forEach((t) => t.stop())
    setPhones((list) => list.filter((x) => x.id !== id))
    // Close the internet link once no phone uses it, so the laptop isn't reachable from outside for longer than needed.
    if (p?.viaInternet && !phones.some((x) => x.id !== id && x.viaInternet)) fetch('/api/tunnel/stop', { method: 'POST' }).catch(() => {})
    setSources((s) => s.map((x) => (x === `phone:${id}` ? null : x)))
  }

  // --- Derived UI --------------------------------------------------------------
  const options: CameraOption[] = [
    ...devices.map((d, i): CameraOption => ({ key: `dev:${d.deviceId}`, label: d.label || `Camera ${i + 1}` })),
    ...phones.map((p): CameraOption => ({
      key: `phone:${p.id}`,
      label: `${p.label} (${p.viaInternet ? 'internet' : 'Wi-Fi'})${p.status === 'connected' ? '' : ` · ${p.status}`}`,
    })),
  ]

  const blocker =
    !lane0.model ? 'Loading pose tracking…'
      : !lane0.hasVideo ? 'Waiting for player 1’s camera…'
      : players === 2 && !sources[1] ? 'Choose a camera for player 2.'
      : players === 2 && sources[1] === sources[0] ? 'Players need two different cameras.'
      : players === 2 && !lane1.hasVideo ? 'Waiting for player 2’s camera…'
      : players === 2 && !lane1.model ? 'Loading pose tracking for player 2…'
      : null

  const cameraLabel = (i: number) => {
    const key = sources[i]
    const phone = phoneFor(key)
    if (phone) return phone.label
    const lane = i === 0 ? lane0 : lane1
    return devices.find((d) => d.deviceId === lane.activeDeviceId)?.label || 'default camera'
  }

  const stageBanner = (i: number, lane: Lane): { banner: ReactNode; kind: 'info' | 'ready' | 'big' | 'done' | 'warn' | null } => {
    const pos = lane.livePosture
    const p = game?.players[i]
    if (screen === 'play' && game) {
      if (p?.finished) return { banner: FINISH_TEXT[p.finished], kind: 'done' }
      if (game.phase === 'countdown') return { banner: String(cd), kind: 'big' }
      if (game.phase === 'running') {
        if (now - (game.startT ?? 0) < GO_MS) return { banner: 'GO!', kind: 'big' }
        if (pos && !pos.ready) return { banner: POSTURE_MESSAGE[pos.state], kind: 'info' }
        // Close to failing (stuck in a rep, or no push-up for a while): a last-seconds warning.
        const left = failLeft(game, i, now, liveInRep[i])
        if (left != null && left <= FAIL_WARN_MS) return { banner: `Keep going! ${Math.ceil(left / 1000)}`, kind: 'warn' }
        return { banner: null, kind: null }
      }
      if (game.phase === 'waiting') return pos?.ready ? { banner: '✓ Ready', kind: 'ready' } : { banner: POSTURE_MESSAGE[pos?.state ?? 'no-player'], kind: 'info' }
    }
    // Setup: help the player find their spot before starting.
    if (lane.hasVideo && pos) return pos.ready ? { banner: '✓ In position', kind: 'ready' } : { banner: POSTURE_MESSAGE[pos.state], kind: 'info' }
    return { banner: null, kind: null }
  }

  const win = game?.phase === 'finished' ? winner(game) : null
  const errors = [
    deviceError && `Cameras: ${deviceError}`,
    ...lanes.flatMap((l, i) => [
      l.cameraError && `Player ${i + 1} camera: ${l.cameraError}`,
      l.modelError && `Player ${i + 1} tracking: ${l.modelError}`,
    ]),
    ...lanes.map((_, i) => {
      const ph = phoneFor(sources[i])
      return ph && (ph.status !== 'connected' || ph.detail) ? `${ph.label} ${PHONE_STATUS_TEXT[ph.status]}. ${ph.detail}` : null
    }),
  ].filter(Boolean) as string[]

  return (
    <div className="app">
      <header className="bar">
        <h1>Pump-Court</h1>
        <span className="model-status">
          {lane0.model ? `Tracking ready (${lane0.model.delegate})` : lane0.modelError ? <b className="err">Tracking failed</b> : 'Loading tracking…'}
        </span>
      </header>

      {errors.map((e) => <p key={e} className="error">{e}</p>)}

      {screen === 'play' && game && <GameBar game={game} now={now} onStop={stopGame} onBack={backToSetup} />}
      {screen === 'play' && game?.phase === 'waiting' && (
        <p className="waiting-note">{players === 2 ? 'Both players' : 'Player'}: get into the push-up position, arms straight. The countdown starts when {players === 2 ? 'both are' : 'you are'} ready.</p>
      )}

      <div className={`stages players-${players}`}>
        {lanes.map((lane, i) => {
          const b = stageBanner(i, lane)
          return (
            <PlayerStage
              key={i}
              label={`Player ${i + 1}`}
              videoRef={lane.videoRef}
              canvasRef={lane.canvasRef}
              frameRef={lane.frameRef}
              rotated={lane.rotation !== 0}
              aspect={lane.aspect}
              control={canRotate && lane.hasVideo ? (
                <div className="stage-control">
                  <button onClick={() => rotate(i)} title="Turn the picture 90° clockwise (use when the camera is on its side)">⟳ Rotate</button>
                  <span className="rot-label">
                    {lane.rotation}°{manualRotation[i] == null ? ' auto' : ''}
                    {manualRotation[i] != null && <button className="small" onClick={() => autoRotate(i)}>auto</button>}
                  </span>
                </div>
              ) : null}
              lights={lightStates(lit[i] ? lastRep[i] : null)}
              flash={lastRep[i]?.rep ?? 0}
              banner={b.banner}
              bannerKind={b.kind}
              player={screen === 'play' ? game?.players[i] ?? null : null}
              noCamera={!lane.hasVideo ? (lane.cameraError ? 'Camera blocked or unavailable. Allow camera access, or pick another camera.' : i === 0 || sources[i] ? 'Starting camera…' : 'Choose a camera for player 2 below.') : null}
              winner={win === i}
            />
          )
        })}
      </div>

      {screen === 'setup' && (
        <Setup
          players={players}
          onPlayers={setPlayers}
          mode={mode}
          onMode={setMode}
          sources={sources}
          onSource={chooseSource}
          options={options}
          onAddCamera={setAddingFor}
          onDisconnect={(i) => { const ph = phoneFor(sources[i]); if (ph) removePhone(ph.id) }}
          isPhone={(i) => !!phoneFor(sources[i])}
          blocker={blocker}
          onStart={startGame}
        />
      )}

      {screen === 'play' && game?.phase === 'finished' && <Results game={game} winner={win} onAgain={startGame} onBack={backToSetup} />}

      <Diagnostics lane={lane0} cameraLabel={cameraLabel(0)} frameSink={diagSink} />

      {addingFor != null && (
        <AddCameraDialog
          onClose={() => setAddingFor(null)}
          onPhone={onPhone}
          onRefreshDevices={refreshDevices}
          nextLabel={`Phone ${phoneNumber}`}
        />
      )}

      <footer>Video is processed live and discarded. With <i>Phone over Wi-Fi</i> nothing leaves this laptop; with <i>Any network</i> the phone's video passes through Cloudflare's tunnel, encrypted and not stored.</footer>
    </div>
  )
}
