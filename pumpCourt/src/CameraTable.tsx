// The Friday checklist table: frame rate for each camera option.
// Kept in localStorage on this laptop; copy it out as Markdown.
import { useState } from 'react'

export interface CameraRow {
  camera: string
  resolution: string
  requestedFps: number
  deliveredFps: number | null
  measuredFps: number | null
  detectFps: number | null
  model: string
  setup?: string
}

const KEY = 'pumpcourt.cameraTable'
const SETUPS = ['Phone as webcam', 'Laptop on the floor', 'USB webcam', 'Other']

function load(): CameraRow[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CameraRow[]) : []
  } catch {
    return []
  }
}

function save(rows: CameraRow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    // Storage blocked: the table still works until the page reloads.
  }
}

const n = (v: number | null, d = 0) => (v == null ? '—' : v.toFixed(d))

function toMarkdown(rows: CameraRow[]) {
  const head = '| Setup | Camera | Resolution | Asked fps | Delivered fps | Measured fps | Pose fps | Model |\n|---|---|---|---|---|---|---|---|'
  const body = rows.map((r) =>
    `| ${r.setup ?? ''} | ${r.camera} | ${r.resolution} | ${r.requestedFps} | ${n(r.deliveredFps)} | ${n(r.measuredFps, 1)} | ${n(r.detectFps, 1)} | ${r.model} |`)
  return [head, ...body].join('\n')
}

export function CameraTable({ current }: { current: CameraRow }) {
  const [rows, setRows] = useState<CameraRow[]>(load)
  const [setup, setSetup] = useState(SETUPS[0])
  const [copied, setCopied] = useState(false)

  const update = (next: CameraRow[]) => { setRows(next); save(next) }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(rows))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt('Copy the table:', toMarkdown(rows))
    }
  }

  return (
    <section className="card">
      <h2>Camera frame-rate table</h2>
      <p className="hint">Try each camera option, let the numbers settle for a few seconds, then add a row.</p>
      <div className="row">
        <select value={setup} onChange={(e) => setSetup(e.target.value)}>
          {SETUPS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button onClick={() => update([...rows, { ...current, setup }])}>Add current camera</button>
        <button onClick={copy} disabled={!rows.length}>{copied ? 'Copied' : 'Copy as Markdown'}</button>
      </div>
      {rows.length > 0 && (
        <div className="table-scroll">
        <table className="reps">
          <thead>
            <tr><th>Setup</th><th>Camera</th><th>Resolution</th><th>Asked</th><th>Delivered</th><th>Measured</th><th>Pose fps</th><th>Model</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.setup}</td><td>{r.camera}</td><td>{r.resolution}</td><td>{r.requestedFps}</td>
                <td>{n(r.deliveredFps)}</td><td>{n(r.measuredFps, 1)}</td><td>{n(r.detectFps, 1)}</td><td>{r.model}</td>
                <td><button className="small" onClick={() => update(rows.filter((_, j) => j !== i))}>remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )
}
