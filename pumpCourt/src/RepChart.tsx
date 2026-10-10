// Two stacked charts on one time axis: elbow angle and shoulder height.
// Separate charts instead of a dual axis, so each keeps its own honest scale.
import { useEffect, useRef, useState } from 'react'
import type { FrameRecord, RepBottom } from './repLog'

interface Props {
  frames: FrameRecord[]
  bottoms: RepBottom[]
}

const C = {
  surface: '#1a1a19',
  grid: '#2c2c2a',
  muted: '#898781',
  text: '#c3c2b7',
  series: '#3987e5',
  good: '#0ca30c',
  critical: '#d03b3b',
}

const PANEL_H = 180
const GAP = 28
const M = { left: 52, right: 16, top: 24, bottom: 28 }
const HEIGHT = M.top + PANEL_H * 2 + GAP + M.bottom

export function RepChart({ frames, bottoms }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const t0 = frames[0]?.t ?? 0
  const t1 = frames[frames.length - 1]?.t ?? 1
  const plotW = width - M.left - M.right
  const xOf = (t: number) => M.left + ((t - t0) / Math.max(1, t1 - t0)) * plotW

  const shoulderVals = frames.map((f) => f.shoulderY).filter((v): v is number => v != null)
  const sMin = shoulderVals.length ? Math.min(...shoulderVals) : 0
  const sMax = shoulderVals.length ? Math.max(...shoulderVals) : 1
  const sPad = Math.max(0.01, (sMax - sMin) * 0.1)

  // Panel 1: elbow 0..180°. Panel 2: shoulder y, larger (lower body) drawn lower.
  const panels = [
    { title: 'Elbow angle (°)', key: 'elbow' as const, top: M.top, lo: 0, hi: 180, ticks: [0, 45, 90, 135, 180], fmt: (v: number) => `${v}` },
    {
      title: 'Shoulder height (lower = body down)', key: 'shoulderY' as const, top: M.top + PANEL_H + GAP,
      lo: sMax + sPad, hi: sMin - sPad, ticks: [] as number[], fmt: (v: number) => v.toFixed(2),
    },
  ]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = C.surface
    ctx.fillRect(0, 0, width, HEIGHT)
    ctx.font = '12px system-ui, sans-serif'

    for (const p of panels) {
      const yOf = (v: number) => p.top + ((p.hi - v) / (p.hi - p.lo)) * PANEL_H
      ctx.fillStyle = C.text
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillText(p.title, M.left, p.top - 8)
      ctx.font = '12px system-ui, sans-serif'
      const ticks = p.ticks.length ? p.ticks : [0, 0.5, 1].map((f) => p.lo + (p.hi - p.lo) * f)
      for (const v of ticks) {
        const y = yOf(v)
        ctx.strokeStyle = C.grid
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(M.left, y); ctx.lineTo(width - M.right, y); ctx.stroke()
        ctx.fillStyle = C.muted
        ctx.textAlign = 'right'
        ctx.fillText(p.fmt(v), M.left - 6, y + 4)
        ctx.textAlign = 'left'
      }

      // Rep bottoms: a vertical rule at the elbow bottom, coloured by result.
      for (const b of bottoms) {
        ctx.strokeStyle = b.clear ? C.good : C.critical
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.beginPath(); ctx.moveTo(xOf(b.elbowT), p.top); ctx.lineTo(xOf(b.elbowT), p.top + PANEL_H); ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.strokeStyle = C.series
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.beginPath()
      let pen = false
      for (const f of frames) {
        const v = f[p.key]
        if (v == null) { pen = false; continue }
        const x = xOf(f.t), y = yOf(v)
        if (pen) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        pen = true
      }
      ctx.stroke()

      // Small dots on each frame, so sparse sampling at the bottom is visible.
      if (frames.length < 1500) {
        ctx.fillStyle = C.series
        for (const f of frames) {
          const v = f[p.key]
          if (v == null) continue
          ctx.beginPath(); ctx.arc(xOf(f.t), yOf(v), 1.6, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    // Rep numbers above the first panel.
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    for (const b of bottoms) {
      ctx.fillStyle = C.text
      ctx.fillText(`${b.clear ? '✓' : '✗'}${b.rep}`, xOf(b.elbowT), M.top + 12)
    }
    ctx.textAlign = 'left'

    // Time axis.
    ctx.fillStyle = C.muted
    const secs = (t1 - t0) / 1000
    const step = secs > 20 ? 5 : secs > 8 ? 2 : 1
    for (let s = 0; s <= secs; s += step) {
      const x = xOf(t0 + s * 1000)
      ctx.fillText(`${s}s`, x - 6, HEIGHT - 8)
    }

    if (hover != null && frames[hover]) {
      const x = xOf(frames[hover].t)
      ctx.strokeStyle = C.text
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, M.top); ctx.lineTo(x, HEIGHT - M.bottom); ctx.stroke()
    }
  }, [frames, bottoms, width, hover])

  const onMove = (e: React.MouseEvent) => {
    if (!frames.length) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const t = t0 + ((e.clientX - rect.left - M.left) / plotW) * (t1 - t0)
    let best = 0
    for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[best].t - t)) best = i
    setHover(best)
  }

  const hf = hover != null ? frames[hover] : null
  return (
    <div ref={wrapRef} className="chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <canvas ref={canvasRef} style={{ width, height: HEIGHT }} />
      {hf && (
        <div className="tooltip" style={{ left: Math.min(width - 190, xOf(hf.t) + 12), top: M.top }}>
          <div className="tooltip-t">{((hf.t - t0) / 1000).toFixed(3)} s · frame {hover}</div>
          <div>Elbow <b>{hf.elbow == null ? '—' : `${hf.elbow.toFixed(1)}°`}</b></div>
          <div>Shoulder y <b>{hf.shoulderY == null ? '—' : hf.shoulderY.toFixed(3)}</b></div>
          <div>Hip <b>{hf.hipAngle == null ? '—' : `${hf.hipAngle.toFixed(0)}°`}</b> · Knee <b>{hf.kneeAngle == null ? '—' : `${hf.kneeAngle.toFixed(0)}°`}</b></div>
          <div>Visibility <b>{hf.visibility == null ? '—' : hf.visibility.toFixed(2)}</b></div>
        </div>
      )}
    </div>
  )
}
