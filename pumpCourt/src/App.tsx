import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddCameraDialog } from './AddCameraDialog'
import { listCameras, loadSavedCameraId, openCamera, REQUESTED_FPS, saveCameraId, stopStream, streamSettings } from './camera'
import { CameraTable, type CameraRow } from './CameraTable'
import { drawOverlay } from './draw'
import { DIFFICULTY, lightStates, RepJudge, summarise, type Difficulty, type RepResult, type SessionSummary } from './judge'
import { JudgePanel, Lights, SessionReport } from './Judging'
import { getLandmarker, MODEL, type LoadedLandmarker } from './landmarker'
import type { PhoneLink, PhoneStatus } from './phoneLink'
import { createSideTracker, type Landmark, type PoseAngles } from './pose'
import { createPostureTracker, POSTURE_MESSAGE, type Posture } from './posture'
import { analyse, DEFAULT_ANALYSIS, judgeLog, verdict, type FrameRecord, type RepLogFile } from './repLog'
import { RepChart } from './RepChart'
import { buzzer, ding, unlockAudio } from './sfx'

interface LiveStats {
  cameraFps: number | null
  detectFps: number | null
  detectMs: number | null
}

interface PhoneCamera {
  id: string
  label: string
  stream: MediaStream
  link: PhoneLink
  status: PhoneStatus
  detail: string
  /** Paired through the internet link (server/tunnel.ts) rather than the local network. */
  viaInternet: boolean
}

const PHONE_STATUS_TEXT: Record<PhoneStatus, string> = {
  waiting: 'is waiting to pair',
  connecting: 'is connecting',
  connected: 'is connected',
  disconnected: 'has disconnected',
  failed: 'was lost',
}

const DIFFICULTY_KEY = 'pumpcourt.difficulty'
function loadDifficulty(): Difficulty {
  try {
    const d = localStorage.getItem(DIFFICULTY_KEY)
    return d && d in DIFFICULTY ? (d as Difficulty) : 'normal'
  } catch {
    return 'normal'
  }
}

/** How long the lights stay lit after a rep before going dark again. */
const LIGHTS_HOLD_MS = 2500

/** Camera choice: a device the OS provides, or a paired phone. */
type SourceKey = `dev:${string}` | `phone:${string}`

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // --- Camera sources -------------------------------------------------------
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [phones, setPhones] = useState<PhoneCamera[]>([])
  const [source, setSource] = useState<SourceKey | null>(() => {
    const saved = loadSavedCameraId()
    return saved ? `dev:${saved}` : null
  })
  // The device actually opened, which differs from `source` when it is unset or unplugged.
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [deliveredFps, setDeliveredFps] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [addingCamera, setAddingCamera] = useState(false)
  // Only goes up, so a removed phone's name is never reused.
  const [phoneNumber, setPhoneNumber] = useState(1)

  // --- Model ------------------------------------------------------------------
  const [model, setModel] = useState<LoadedLandmarker | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  // Set when the GPU delegate starts failing mid-session; the model is rebuilt on CPU.
  const [cpuOnly, setCpuOnly] = useState(false)

  // --- Diagnostics ------------------------------------------------------------
  const [stats, setStats] = useState<LiveStats>({ cameraFps: null, detectFps: null, detectMs: null })
  // Count of frames the video element has actually shown. A disconnected phone
  // leaves currentTime ticking over a frozen frame, so this is the honest
  // "is there a new frame" signal. -1 when the browser can't report it.
  const presentedRef = useRef(-1)
  const [liveAngles, setLiveAngles] = useState<PoseAngles | null>(null)
  const [livePosture, setLivePosture] = useState<Posture | null>(null)
  const [recording, setRecording] = useState(false)
  const recordingRef = useRef(false)
  const logRef = useRef<FrameRecord[]>([])
  const logStartRef = useRef(0)
  const [log, setLog] = useState<RepLogFile | null>(null)
  const [analysisOpts, setAnalysisOpts] = useState(DEFAULT_ANALYSIS)

  // --- Judging -----------------------------------------------------------------
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty)
  const [judging, setJudging] = useState(false)
  const judgeRef = useRef<RepJudge | null>(null)
  const [results, setResults] = useState<RepResult[]>([])
  const [lastRep, setLastRep] = useState<RepResult | null>(null)
  const [lightsLit, setLightsLit] = useState(false)
  const sessionStartRef = useRef(0)
  const [report, setReport] = useState<{ summary: SessionSummary; results: RepResult[]; difficulty: Difficulty } | null>(null)
  const onRepRef = useRef<(r: RepResult) => void>(() => {})

  const phone = source?.startsWith('phone:') ? phones.find((p) => `phone:${p.id}` === source) ?? null : null
  const phoneStream = phone?.stream ?? null
  const cameraLabel = phone
    ? phone.label
    : devices.find((c) => c.deviceId === activeDeviceId)?.label || 'default camera'

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await listCameras())
    } catch (err) {
      setCameraError(String(err))
    }
  }, [])

  // Open the chosen camera. Phones already carry a live stream; devices are opened here.
  useEffect(() => {
    let cancelled = false
    const video = videoRef.current!
    setCameraError(null)
    setDeliveredFps(null)

    const isPhone = !!source?.startsWith('phone:')
    const show = async (stream: MediaStream) => {
      video.srcObject = stream
      await video.play().catch(() => {})
      // A phone's track settings describe the network stream, not the phone's
      // camera, so its delivered rate isn't meaningful; the measured rate is.
      setDeliveredFps(isPhone ? null : streamSettings(stream).frameRate ?? null)
    }
    // Read the size from the video itself, which follows a phone's stream as its quality adapts.
    const onResize = () => setResolution(video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '')
    video.addEventListener('resize', onResize)

    if (source?.startsWith('phone:')) {
      if (!phoneStream) {
        setSource(null)
        return
      }
      stopStream(streamRef.current)
      streamRef.current = null
      show(phoneStream)
      return () => { video.removeEventListener('resize', onResize) }
    }

    const wanted = source?.startsWith('dev:') ? source.slice(4) : null
    ;(async () => {
      try {
        let stream: MediaStream
        try {
          stream = await openCamera(wanted)
        } catch (err) {
          // A saved camera may be unplugged; fall back to the default one.
          if (wanted && (err as DOMException).name === 'OverconstrainedError') stream = await openCamera(null)
          else throw err
        }
        if (cancelled) { stopStream(stream); return }
        stopStream(streamRef.current)
        streamRef.current = stream
        await show(stream)
        const id = streamSettings(stream).deviceId ?? null
        setActiveDeviceId(id)
        // Replace a saved id that no longer exists, so the next load opens directly.
        if (wanted && id && id !== wanted) saveCameraId(id)
        // Labels are only available after permission is granted.
        await refreshDevices()
      } catch (err) {
        if (!cancelled) setCameraError(`${(err as Error).name}: ${(err as Error).message}`)
      }
    })()
    return () => {
      cancelled = true
      video.removeEventListener('resize', onResize)
    }
  }, [source, phoneStream, refreshDevices])

  useEffect(() => {
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
      stopStream(streamRef.current)
    }
  }, [refreshDevices])

  const chooseSource = (key: SourceKey) => {
    if (key.startsWith('dev:')) saveCameraId(key.slice(4))
    setSource(key)
  }

  const onPhone = useCallback((p: { id: string; label: string; stream: MediaStream; link: PhoneLink; viaInternet?: boolean }) => {
    const setStatus = (status: PhoneStatus, detail?: string) =>
      setPhones((list) => list.map((x) => (x.id === p.id ? { ...x, status, detail: detail ?? '' } : x)))
    // If the phone page reloads it reconnects with a new stream.
    const setStream = (stream: MediaStream) =>
      setPhones((list) => list.map((x) => (x.id === p.id ? { ...x, stream } : x)))
    p.link.setHandlers({ onStatus: setStatus, onStream: setStream })
    setPhones((list) => [...list, { ...p, status: 'connected', detail: '', viaInternet: !!p.viaInternet }])
    setPhoneNumber((n) => n + 1)
    setSource(`phone:${p.id}`)
    setAddingCamera(false)
  }, [])

  const removePhone = (id: string) => {
    const p = phones.find((x) => x.id === id)
    p?.link.close()
    p?.stream.getTracks().forEach((t) => t.stop())
    setPhones((list) => list.filter((x) => x.id !== id))
    // Close the internet link once no phone uses it, so the laptop isn't reachable from outside for longer than needed.
    if (p?.viaInternet && !phones.some((x) => x.id !== id && x.viaInternet)) fetch('/api/tunnel/stop', { method: 'POST' }).catch(() => {})
    if (source === `phone:${id}`) setSource(activeDeviceId ? `dev:${activeDeviceId}` : null)
  }

  // --- Model (created once, never in the loop) -------------------------------
  useEffect(() => {
    let cancelled = false
    setModel(null)
    setModelError(null)
    getLandmarker(MODEL, cpuOnly).then(
      (m) => { if (!cancelled) setModel(m) },
      (err) => {
        if (cancelled) return
        const webgl = /activeTexture|Aborted|WebGL/i.test(String(err))
        setModelError(webgl ? `pose tracking needs WebGL, which this browser could not start. Use Chrome with hardware acceleration on. (${err})` : String(err))
      },
    )
    return () => { cancelled = true }
  }, [cpuOnly])

  // --- Camera frame rate, measured independently of detection --------------
  useEffect(() => {
    const video = videoRef.current
    if (!video || !('requestVideoFrameCallback' in video)) return
    // Count frames from presentedFrames rather than callbacks: callbacks are
    // skipped while detection blocks the main thread, presented frames are not.
    let since = performance.now(), sinceFrames = -1, handle = 0, alive = true
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return
      presentedRef.current = meta.presentedFrames
      const now = performance.now()
      if (sinceFrames < 0 || meta.presentedFrames < sinceFrames) {
        since = now; sinceFrames = meta.presentedFrames
      } else if (now - since >= 1000) {
        const fps = ((meta.presentedFrames - sinceFrames) * 1000) / (now - since)
        setStats((s) => ({ ...s, cameraFps: fps }))
        since = now; sinceFrames = meta.presentedFrames
      }
      handle = video.requestVideoFrameCallback(onFrame)
    }
    handle = video.requestVideoFrameCallback(onFrame)
    return () => { alive = false; video.cancelVideoFrameCallback(handle) }
  }, [])

  // --- Detection loop -------------------------------------------------------
  useEffect(() => {
    if (!model) return
    const video = videoRef.current!
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const tracker = createSideTracker()
    const posture = createPostureTracker()
    let raf = 0
    let lastVideoTime = -1
    let lastPresented = -1
    let lastTs = 0
    let detections = 0, detectMsSum = 0, since = performance.now(), lastUi = 0
    let failures = 0
    let lastFrameAt = performance.now(), cleared = false

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const presented = presentedRef.current
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]
      const live = !!track && track.readyState === 'live' && !track.muted
      const fresh = presented >= 0 ? presented !== lastPresented : video.currentTime !== lastVideoTime
      if (video.readyState < 2 || !fresh || !live || !video.videoWidth) {
        // A stalled camera (e.g. a phone dropping out) must not leave a frozen skeleton behind.
        if (!cleared && performance.now() - lastFrameAt > 500) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          cleared = true
          setStats((st) => ({ ...st, detectFps: 0, detectMs: null }))
          detections = 0; detectMsSum = 0; since = performance.now()
        }
        return
      }
      lastVideoTime = video.currentTime
      lastPresented = presented
      lastFrameAt = performance.now()
      cleared = false
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      // detectForVideo needs strictly increasing timestamps.
      const ts = Math.max(performance.now(), lastTs + 0.001)
      lastTs = ts
      const t0 = performance.now()
      let pose: Landmark[] | undefined
      try {
        pose = model.landmarker.detectForVideo(video, ts).landmarks[0]
      } catch (err) {
        if (++failures < 10) return
        cancelAnimationFrame(raf)
        console.error('Pose detection keeps failing', err)
        if (model.delegate === 'GPU') setCpuOnly(true)
        else setModelError(`detection failed on CPU: ${(err as Error).message}`)
        return
      }
      failures = 0
      detectMsSum += performance.now() - t0
      detections++

      const angles = tracker.update(pose, video.videoWidth / video.videoHeight)
      drawOverlay(ctx, pose, angles ? angles.side : null)
      // Only a player in the push-up position, hands planted, is judged. Height is measured from the hands' floor line.
      const pos = posture.update(ts, angles)

      const judge = judgeRef.current
      if (judge) {
        const rep = judge.push(ts, angles && {
          elbow: angles.elbow,
          hip: angles.abdomen,
          knee: angles.knee,
          bodyOffset: angles.bodyOffset,
          depth: pos.height,
          shoulderY: angles.shoulderY,
          ready: pos.ready,
        })
        if (rep) onRepRef.current(rep)
      }

      if (recordingRef.current) {
        logRef.current.push({
          t: ts - logStartRef.current,
          elbow: angles && Number.isFinite(angles.elbow) ? angles.elbow : null,
          shoulderY: angles?.shoulderY ?? null,
          hipAngle: angles && Number.isFinite(angles.hip) ? angles.hip : null,
          kneeAngle: angles && Number.isFinite(angles.knee) ? angles.knee : null,
          visibility: angles?.visibility ?? null,
          depth: angles && Number.isFinite(angles.depth) ? angles.depth : null,
          abdomen: angles && Number.isFinite(angles.abdomen) ? angles.abdomen : null,
          bodyOffset: angles && Number.isFinite(angles.bodyOffset) ? angles.bodyOffset : null,
          height: Number.isFinite(pos.height) ? pos.height : null,
          ready: pos.ready,
        })
      }

      const now = performance.now()
      // The diagnostics readout updates a few times a second, not every frame.
      if (now - lastUi > 250) {
        lastUi = now
        setLiveAngles(angles)
        setLivePosture(pos)
      }
      if (now - since >= 1000) {
        // Read the counters now: the updater runs later, after they are reset.
        const detectFps = (detections * 1000) / (now - since)
        const detectMs = detections ? detectMsSum / detections : null
        setStats((s) => ({ ...s, detectFps, detectMs }))
        detections = 0; detectMsSum = 0; since = now
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [model])

  // --- Judging -----------------------------------------------------------------
  const lightsTimer = useRef(0)
  const onRep = (r: RepResult) => {
    setResults((list) => [...list, r])
    setLastRep(r)
    setLightsLit(true)
    clearTimeout(lightsTimer.current)
    lightsTimer.current = window.setTimeout(() => setLightsLit(false), LIGHTS_HOLD_MS)
    if (r.counted) ding(r.perfect)
    else buzzer()
  }
  // The frame loop calls the latest handler without restarting.
  useEffect(() => { onRepRef.current = onRep })
  useEffect(() => () => clearTimeout(lightsTimer.current), [])

  const chooseDifficulty = (d: Difficulty) => {
    setDifficulty(d)
    try {
      localStorage.setItem(DIFFICULTY_KEY, d)
    } catch {
      // Not saved; the choice still applies until reload.
    }
  }

  const startJudging = () => {
    unlockAudio()
    judgeRef.current = new RepJudge(DIFFICULTY[difficulty])
    sessionStartRef.current = performance.now()
    setResults([])
    setLastRep(null)
    setLightsLit(false)
    setReport(null)
    setJudging(true)
  }

  const stopJudging = () => {
    const judge = judgeRef.current
    judgeRef.current = null
    setJudging(false)
    const last = judge?.finish() ?? null
    const all = last ? [...results, last] : results
    if (last) onRep(last)
    setReport({ summary: summarise(all, performance.now() - sessionStartRef.current), results: all, difficulty })
  }

  /** Score a recorded log with the current difficulty, without sounds. */
  const judgeRecordedLog = () => {
    if (!log) return
    const all = judgeLog(log.frames, new RepJudge(DIFFICULTY[difficulty]))
    const span = log.frames.length ? log.frames[log.frames.length - 1].t - log.frames[0].t : 0
    setReport({ summary: summarise(all, span), results: all, difficulty })
  }

  // --- Fast-rep log ---------------------------------------------------------
  const startLog = useCallback(() => {
    logRef.current = []
    logStartRef.current = performance.now()
    recordingRef.current = true
    setRecording(true)
    setLog(null)
  }, [])

  const stopLog = useCallback(() => {
    recordingRef.current = false
    setRecording(false)
    setLog({
      version: 1,
      createdAt: new Date().toISOString(),
      camera: cameraLabel,
      requestedFps: REQUESTED_FPS,
      deliveredFps,
      model: model ? `${model.variant}/${model.delegate}` : 'none',
      side: 'auto',
      frames: logRef.current,
    })
  }, [cameraLabel, deliveredFps, model])

  const analysis = useMemo(() => (log ? analyse(log.frames, analysisOpts) : null), [log, analysisOpts])

  const exportLog = () => {
    if (!log) return
    const blob = new Blob([JSON.stringify(log, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `replog-${log.createdAt.replace(/[:.]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importLog = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as RepLogFile
      if (!Array.isArray(data.frames)) throw new Error('missing frames')
      setLog(data)
    } catch (err) {
      alert(`Could not read log: ${(err as Error).message}`)
    }
  }

  const currentCameraRow: CameraRow = {
    camera: cameraLabel,
    resolution,
    requestedFps: REQUESTED_FPS,
    deliveredFps,
    measuredFps: stats.cameraFps,
    detectFps: stats.detectFps,
    model: model ? `${model.variant}/${model.delegate}` : '—',
  }

  const fmt = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d))
  const sourceValue: string = source ?? (activeDeviceId ? `dev:${activeDeviceId}` : '')

  return (
    <div className="app">
      <header className="bar">
        <h1>Pump-Court</h1>
        <label>
          Camera
          <select value={sourceValue} onChange={(e) => chooseSource(e.target.value as SourceKey)}>
            {devices.length === 0 && phones.length === 0 && <option value="">(waiting for permission)</option>}
            {devices.map((c, i) => (
              <option key={c.deviceId} value={`dev:${c.deviceId}`}>{c.label || `Camera ${i + 1}`}</option>
            ))}
            {phones.map((p) => (
              <option key={p.id} value={`phone:${p.id}`}>
                {p.label} ({p.viaInternet ? 'internet' : 'Wi-Fi'}){p.status === 'connected' ? '' : ` · ${p.status}`}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setAddingCamera(true)}>+ Add camera</button>
        {phone && <button className="small" onClick={() => removePhone(phone.id)}>Disconnect {phone.label}</button>}
        <span className="model-status">
          {model ? `Tracking ready (${model.delegate})` : modelError ? <b className="err">Tracking failed</b> : 'Loading tracking…'}
        </span>
      </header>

      {cameraError && <p className="error">Camera: {cameraError}</p>}
      {modelError && <p className="error">Model: {modelError}</p>}
      {phone && (phone.status !== 'connected' || phone.detail) && (
        <p className="error">
          {phone.label} {PHONE_STATUS_TEXT[phone.status]}. {phone.detail}
          {phone.status !== 'connected' && ' Check the phone, or pick another camera.'}
        </p>
      )}

      <div className="arena">
        <main className="stage">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />
          <Lights states={lightStates(lightsLit ? lastRep : null)} flash={lastRep?.rep ?? 0} />
        </main>
        <JudgePanel
          judging={judging}
          canStart={!!model}
          difficulty={difficulty}
          onDifficulty={chooseDifficulty}
          onStart={startJudging}
          onStop={stopJudging}
          good={results.filter((r) => r.counted).length}
          perfect={results.filter((r) => r.perfect).length}
          attempted={results.length}
          lastFaults={lastRep?.faults ?? null}
          inPosition={judging ? livePosture?.ready ?? false : null}
          waitingReason={
            !model ? 'Waiting for pose tracking to load…'
              : judging && livePosture && !livePosture.ready ? POSTURE_MESSAGE[livePosture.state]
              : null
          }
        />
      </div>

      {report && (
        <SessionReport summary={report.summary} results={report.results} difficulty={report.difficulty} onClose={() => setReport(null)} />
      )}

      <details className="card diagnostics">
        <summary>Diagnostics</summary>

        <div className="stats">
          <span className={deliveredFps != null && deliveredFps < REQUESTED_FPS - 1 ? 'stat warn' : 'stat'}>
            Delivered <b>{fmt(deliveredFps)}</b> fps <small>(asked {REQUESTED_FPS})</small>
          </span>
          <span className="stat">Measured camera <b>{fmt(stats.cameraFps, 1)}</b> fps</span>
          <span className="stat">Pose <b>{fmt(stats.detectFps, 1)}</b> fps · <b>{fmt(stats.detectMs, 1)}</b> ms</span>
          <span className="stat">{resolution || '—'}</span>
          <span className="stat">Model <b>{model ? `${model.variant} on ${model.delegate}` : '—'}</b></span>
        </div>

        <h3>Live angles</h3>
        <dl className="angles">
          <dt>Side</dt><dd>{liveAngles?.side ?? 'not visible'}</dd>
          <dt>Elbow</dt><dd>{fmt(liveAngles?.elbow)}°</dd>
          <dt>Hip</dt><dd>{fmt(liveAngles?.hip)}°</dd>
          <dt>Knee</dt><dd>{fmt(liveAngles?.knee)}°</dd>
          <dt>Abdomen line</dt><dd>{fmt(liveAngles?.abdomen)}°</dd>
          <dt>Trunk tilt</dt><dd>{fmt(liveAngles?.trunkTilt)}°</dd>
          <dt>Position</dt><dd>{livePosture ? (livePosture.ready ? 'ready' : livePosture.state) : '—'}</dd>
          <dt>Height above floor</dt><dd>{fmt(livePosture?.height, 2)} arm</dd>
        </dl>

        <h3>Fast-rep test</h3>
        <p className="hint">Have the player do 10 flat-out reps. Start the log, then Stop once they are back up after the last rep. A log that ends at the bottom loses that rep.</p>
        <div className="row">
          {recording
            ? <button className="rec" onClick={stopLog}>■ Stop log</button>
            : <button onClick={startLog} disabled={!model}>● Start log</button>}
          <button onClick={exportLog} disabled={!log}>Export JSON</button>
          <button onClick={judgeRecordedLog} disabled={!log || judging} title="Score this log with the selected difficulty">
            Judge this log ({DIFFICULTY[difficulty].label})
          </button>
          <label className="file">
            Load JSON
            <input type="file" accept="application/json,.json" onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // so picking the same file again reloads it
              if (file) importLog(file)
            }} />
          </label>
        </div>
        {recording && <RecordingTicker logRef={logRef} />}

        {log && analysis && (
          <>
            <div className="verdict-row">
              <div className={`verdict ${verdict(analysis)}`}>
                {verdict(analysis) === 'go' ? '✓ GO' : '✗ NO-GO'}
              </div>
              <div>
                <b>{analysis.clearCount}</b> of <b>{analysis.bottoms.length}</b> reps show a clear bottom
                {analysis.bottoms.length !== 10 && <span className="warn"> (expected 10 reps — check the tuning below)</span>}
                <br />
                <small>
                  {log.frames.length} frames · {fmt(analysis.fps, 1)} fps logged · {analysis.droppedFrames} frames without a usable pose ·
                  {' '}{log.camera} · {log.model}
                </small>
              </div>
            </div>
            <RepChart frames={log.frames} bottoms={analysis.bottoms} />
            <details>
              <summary>Analysis tuning</summary>
              <div className="row">
                <NumField label="Elbow swing (°)" value={analysisOpts.elbowProminence} step={5}
                  onChange={(v) => setAnalysisOpts({ ...analysisOpts, elbowProminence: v })} />
                <NumField label="Shoulder drop (frame)" value={analysisOpts.shoulderProminence} step={0.005}
                  onChange={(v) => setAnalysisOpts({ ...analysisOpts, shoulderProminence: v })} />
                <NumField label="Sync window (ms)" value={analysisOpts.syncWindowMs} step={10}
                  onChange={(v) => setAnalysisOpts({ ...analysisOpts, syncWindowMs: v })} />
                <NumField label="Elbow bottom band (°)" value={analysisOpts.elbowBottomTol} step={1}
                  onChange={(v) => setAnalysisOpts({ ...analysisOpts, elbowBottomTol: v })} />
                <NumField label="Shoulder bottom band" value={analysisOpts.shoulderBottomTol} step={0.001}
                  onChange={(v) => setAnalysisOpts({ ...analysisOpts, shoulderBottomTol: v })} />
                <NumField label="Min visibility" value={analysisOpts.minVisibility} step={0.05}
                  onChange={(v) => setAnalysisOpts({ ...analysisOpts, minVisibility: v })} />
              </div>
            </details>
            <div className="table-scroll">
              <table className="reps">
                <thead>
                  <tr><th>Rep</th><th>Elbow min</th><th>Elbow bottom</th><th>Shoulder bottom</th><th>Offset</th><th>Frames</th><th>Result</th></tr>
                </thead>
                <tbody>
                  {analysis.bottoms.map((b) => (
                    <tr key={b.rep}>
                      <td>{b.rep}</td>
                      <td>{b.elbowMin.toFixed(0)}°</td>
                      <td>{(b.elbowT / 1000).toFixed(2)} s</td>
                      <td>{b.shoulderT == null ? '—' : `${(b.shoulderT / 1000).toFixed(2)} s`}</td>
                      <td>{b.offsetMs == null ? '—' : `${Math.round(b.offsetMs)} ms`}</td>
                      <td>{b.frames}</td>
                      <td className={b.clear ? 'ok' : 'low'}>{b.clear ? '✓ clear' : `✗ ${b.reason}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <CameraTable current={currentCameraRow} />
      </details>

      {addingCamera && (
        <AddCameraDialog
          onClose={() => setAddingCamera(false)}
          onPhone={onPhone}
          onRefreshDevices={refreshDevices}
          nextLabel={`Phone ${phoneNumber}`}
        />
      )}

      <footer>Video is processed live and discarded. Nothing is recorded or uploaded; the page may only connect to this laptop and paired phones.</footer>
    </div>
  )
}

function RecordingTicker({ logRef }: { logRef: React.RefObject<FrameRecord[]> }) {
  const [snap, setSnap] = useState({ secs: 0, frames: 0 })
  useEffect(() => {
    const id = setInterval(() => {
      const f = logRef.current
      setSnap({ secs: f.length ? f[f.length - 1].t / 1000 : 0, frames: f.length })
    }, 250)
    return () => clearInterval(id)
  }, [logRef])
  return <p className="recording">● Recording · {snap.secs.toFixed(1)} s · {snap.frames} frames</p>
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="num">
      {label}
      <input type="number" value={value} step={step} onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (Number.isFinite(v)) onChange(v)
      }} />
    </label>
  )
}
