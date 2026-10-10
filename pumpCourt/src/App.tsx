import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listCameras, loadSavedCameraId, openCamera, REQUESTED_FPS, saveCameraId, stopStream, streamSettings } from './camera'
import { drawOverlay } from './draw'
import { getLandmarker, type LoadedLandmarker, type ModelVariant } from './landmarker'
import { BODY_POINTS, computeAngles, type Landmark, type PoseAngles, type SideMode } from './pose'
import { analyse, DEFAULT_ANALYSIS, verdict, type FrameRecord, type RepLogFile } from './repLog'
import { RepChart } from './RepChart'
import { CameraTable, type CameraRow } from './CameraTable'

interface LiveStats {
  cameraFps: number | null
  detectFps: number | null
  detectMs: number | null
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState<string | null>(() => loadSavedCameraId())
  // The device actually opened, which differs from cameraId when it is null or unplugged.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [deliveredFps, setDeliveredFps] = useState<number | null>(null)
  const [resolution, setResolution] = useState<string>('')
  const [cameraError, setCameraError] = useState<string | null>(null)

  const [variant, setVariant] = useState<ModelVariant>('lite')
  const [model, setModel] = useState<LoadedLandmarker | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  // Set when the GPU delegate starts failing mid-session; the model is rebuilt on CPU.
  const [cpuOnly, setCpuOnly] = useState(false)

  const [sideMode, setSideMode] = useState<SideMode>('auto')
  const [showLabels, setShowLabels] = useState(true)
  const [stats, setStats] = useState<LiveStats>({ cameraFps: null, detectFps: null, detectMs: null })
  const [visRows, setVisRows] = useState<number[]>([])
  const [liveAngles, setLiveAngles] = useState<PoseAngles | null>(null)

  const [recording, setRecording] = useState(false)
  const recordingRef = useRef(false)
  const logRef = useRef<FrameRecord[]>([])
  const logStartRef = useRef(0)
  const [log, setLog] = useState<RepLogFile | null>(null)
  const [analysisOpts, setAnalysisOpts] = useState(DEFAULT_ANALYSIS)

  // Settings read inside the frame loop without restarting it.
  const sideModeRef = useRef(sideMode)
  const showLabelsRef = useRef(showLabels)
  useEffect(() => { sideModeRef.current = sideMode }, [sideMode])
  useEffect(() => { showLabelsRef.current = showLabels }, [showLabels])

  const cameraLabel = cameras.find((c) => c.deviceId === activeId)?.label || 'default camera'

  // --- Camera -------------------------------------------------------------
  const refreshCameras = useCallback(async () => {
    try {
      setCameras(await listCameras())
    } catch (err) {
      setCameraError(String(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCameraError(null)
      setDeliveredFps(null)
      try {
        let stream: MediaStream
        try {
          stream = await openCamera(cameraId)
        } catch (err) {
          // A saved camera may be unplugged; fall back to the default one.
          if (cameraId && (err as DOMException).name === 'OverconstrainedError') stream = await openCamera(null)
          else throw err
        }
        if (cancelled) { stopStream(stream); return }
        stopStream(streamRef.current)
        streamRef.current = stream
        const video = videoRef.current!
        video.srcObject = stream
        await video.play().catch(() => {})
        const s = streamSettings(stream)
        setDeliveredFps(s.frameRate ?? null)
        setResolution(s.width && s.height ? `${s.width}×${s.height}` : '')
        // Labels are only available after permission is granted.
        await refreshCameras()
        setActiveId(s.deviceId ?? null)
        // Replace a saved id that no longer exists, so the next load opens directly.
        if (cameraId && s.deviceId && s.deviceId !== cameraId) saveCameraId(s.deviceId)
      } catch (err) {
        if (!cancelled) setCameraError(`${(err as Error).name}: ${(err as Error).message}`)
      }
    })()
    return () => { cancelled = true }
  }, [cameraId, refreshCameras])

  useEffect(() => {
    navigator.mediaDevices?.addEventListener('devicechange', refreshCameras)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refreshCameras)
      stopStream(streamRef.current)
    }
  }, [refreshCameras])

  const chooseCamera = (id: string) => {
    saveCameraId(id)
    setCameraId(id)
  }

  // --- Model (created once per variant, never in the loop) ----------------
  useEffect(() => {
    let cancelled = false
    setModel(null)
    setModelError(null)
    getLandmarker(variant, cpuOnly).then(
      (m) => { if (!cancelled) setModel(m) },
      (err) => {
        if (cancelled) return
        const webgl = /activeTexture|Aborted|WebGL/i.test(String(err))
        setModelError(webgl ? `pose tracking needs WebGL, which this browser could not start. Use Chrome with hardware acceleration on. (${err})` : String(err))
      },
    )
    return () => { cancelled = true }
  }, [variant, cpuOnly])

  // --- Camera frame rate, measured independently of detection --------------
  useEffect(() => {
    const video = videoRef.current
    if (!video || !('requestVideoFrameCallback' in video)) return
    // Count frames from presentedFrames rather than callbacks: callbacks are
    // skipped while detection blocks the main thread, presented frames are not.
    let since = performance.now(), sinceFrames = -1, handle = 0, alive = true
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return
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
    let raf = 0
    let lastVideoTime = -1
    let lastTs = 0
    let detections = 0, detectMsSum = 0, since = performance.now(), lastUi = 0
    let failures = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime
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

      const angles = pose ? computeAngles(pose, sideModeRef.current, video.videoWidth / video.videoHeight) : null
      drawOverlay(ctx, pose, angles, showLabelsRef.current)

      if (recordingRef.current) {
        logRef.current.push({
          t: ts - logStartRef.current,
          elbow: angles && Number.isFinite(angles.elbow) ? angles.elbow : null,
          shoulderY: angles?.shoulderY ?? null,
          hipAngle: angles && Number.isFinite(angles.hip) ? angles.hip : null,
          kneeAngle: angles && Number.isFinite(angles.knee) ? angles.knee : null,
          visibility: angles?.visibility ?? null,
        })
      }

      const now = performance.now()
      if (now - lastUi > 200) {
        lastUi = now
        setVisRows(pose ? BODY_POINTS.map((p) => pose![p.index].visibility ?? 0) : [])
        setLiveAngles(angles)
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
    return () => cancelAnimationFrame(raf)
  }, [model])

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
      side: sideMode,
      frames: logRef.current,
    })
  }, [cameraLabel, deliveredFps, model, sideMode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, select, textarea, button')) return
      e.preventDefault()
      if (recordingRef.current) stopLog()
      else startLog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startLog, stopLog])

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

  const fmt = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toFixed(d))
  const lowFps = deliveredFps != null && deliveredFps < REQUESTED_FPS - 1

  return (
    <div className="app">
      <header className="bar">
        <h1>Pump-Court · camera &amp; pose</h1>
        <label>
          Camera
          <select value={activeId ?? cameraId ?? ''} onChange={(e) => chooseCamera(e.target.value)}>
            {cameras.length === 0 && <option value="">(waiting for permission)</option>}
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select value={variant} onChange={(e) => setVariant(e.target.value as ModelVariant)}>
            <option value="lite">lite (fastest)</option>
            <option value="full">full (more accurate)</option>
          </select>
        </label>
        <label>
          Side
          <select value={sideMode} onChange={(e) => setSideMode(e.target.value as SideMode)}>
            <option value="auto">auto (most visible)</option>
            <option value="left">lock left</option>
            <option value="right">lock right</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          visibility labels
        </label>
      </header>

      <div className="stats">
        <span className={lowFps ? 'stat warn' : 'stat'}>
          Delivered <b>{fmt(deliveredFps)}</b> fps <small>(asked {REQUESTED_FPS})</small>
        </span>
        <span className="stat">Measured camera <b>{fmt(stats.cameraFps, 1)}</b> fps</span>
        <span className="stat">Pose <b>{fmt(stats.detectFps, 1)}</b> fps · <b>{fmt(stats.detectMs, 1)}</b> ms</span>
        <span className="stat">{resolution || '—'}</span>
        <span className="stat">
          Model {model ? <b>{model.variant} on {model.delegate}</b> : modelError ? <b className="err">failed</b> : 'loading…'}
        </span>
      </div>
      {cameraError && <p className="error">Camera: {cameraError}</p>}
      {modelError && <p className="error">Model: {modelError}</p>}

      <main className="live">
        <div className="stage">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />
        </div>
        <aside className="panel">
          <h2>Angles</h2>
          <dl className="angles">
            <dt>Elbow</dt><dd>{liveAngles ? fmt(liveAngles.elbow) : '—'}°</dd>
            <dt>Hip</dt><dd>{liveAngles ? fmt(liveAngles.hip) : '—'}°</dd>
            <dt>Knee</dt><dd>{liveAngles ? fmt(liveAngles.knee) : '—'}°</dd>
          </dl>
          <h2>Visibility</h2>
          <table className="vis">
            <tbody>
              {BODY_POINTS.map((p, i) => {
                const v = visRows[i]
                const cls = v == null ? '' : v >= 0.8 ? 'ok' : v >= 0.5 ? 'mid' : 'low'
                return (
                  <tr key={p.index} className={cls}>
                    <td>{p.index}</td><td>{p.name}</td><td>{v == null ? '—' : v.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </aside>
      </main>

      <section className="card">
        <h2>Fast-rep test</h2>
        <p className="hint">Have the player do 10 flat-out reps. Press Start (or Space), then Stop once they are back up after the last rep. A log that ends at the bottom loses that rep.</p>
        <div className="row">
          {recording
            ? <button className="rec" onClick={stopLog}>■ Stop log</button>
            : <button onClick={startLog} disabled={!model}>● Start log</button>}
          <button onClick={exportLog} disabled={!log}>Export JSON</button>
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
      </section>

      <CameraTable current={currentCameraRow} />

      <footer>Video is processed live and discarded. Nothing is recorded or uploaded; the page may only connect to this laptop.</footer>
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
