// Diagnostics for player 1's camera: frame rates, live angles, the fast-rep
// go/no-go test, replaying a log through the referee, and the camera table.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { REQUESTED_FPS } from './camera'
import { CameraTable, type CameraRow } from './CameraTable'
import { DIFFICULTY, RepJudge, summarise, type RepResult, type SessionSummary } from './judge'
import { SessionReport } from './Judging'
import { analyse, DEFAULT_ANALYSIS, judgeLog, verdict, type FrameRecord, type RepLogFile } from './repLog'
import { RepChart } from './RepChart'
import type { Lane, LaneFrame } from './useLane'

interface Props {
  lane: Lane
  cameraLabel: string
  /** Diagnostics registers here to receive player 1's frames while logging. */
  frameSink: RefObject<((f: LaneFrame) => void) | null>
}

export function Diagnostics({ lane, cameraLabel, frameSink }: Props) {
  const { model, stats, deliveredFps, resolution, liveAngles, livePosture } = lane
  const [recording, setRecording] = useState(false)
  const recordingRef = useRef(false)
  const logRef = useRef<FrameRecord[]>([])
  const logStartRef = useRef(0)
  const [log, setLog] = useState<RepLogFile | null>(null)
  const [analysisOpts, setAnalysisOpts] = useState(DEFAULT_ANALYSIS)
  const [report, setReport] = useState<{ summary: SessionSummary; results: RepResult[] } | null>(null)

  useEffect(() => {
    frameSink.current = ({ ts, angles, posture: pos }) => {
      if (!recordingRef.current) return
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
    return () => { frameSink.current = null }
  }, [frameSink])

  /** Score a recorded log on Hard, without sounds. */
  const judgeRecordedLog = () => {
    if (!log) return
    const all = judgeLog(log.frames, new RepJudge(DIFFICULTY.hard))
    const span = log.frames.length ? log.frames[log.frames.length - 1].t - log.frames[0].t : 0
    setReport({ summary: summarise(all, span), results: all })
  }

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

  return (
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
        <button onClick={judgeRecordedLog} disabled={!log} title="Score this log on Hard">
          Judge this log
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

      {report && <SessionReport title="Replayed log · Hard" summary={report.summary} results={report.results} onClose={() => setReport(null)} />}

      <CameraTable current={currentCameraRow} />
    </details>
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
