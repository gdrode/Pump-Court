// Overlay drawing only. Takes landmarks and computed angles; computes nothing itself.
import { BODY_POINTS, BONES, SIDE_POINTS, vis, type Landmark, type PoseAngles } from './pose'

const LOW_VIS = 0.5

function visColor(v: number) {
  if (v >= 0.8) return '#0ca30c'
  if (v >= LOW_VIS) return '#fab219'
  return '#d03b3b'
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  pose: Landmark[] | undefined,
  angles: PoseAngles | null,
  showLabels: boolean,
) {
  const { width: w, height: h } = ctx.canvas
  ctx.clearRect(0, 0, w, h)
  if (!pose) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, w, h * 0.09)
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${Math.round(h * 0.05)}px system-ui, sans-serif`
    ctx.fillText('No pose', w * 0.02, h * 0.065)
    return
  }
  const unit = h / 720
  const used = angles ? new Set(Object.values(SIDE_POINTS[angles.side])) : new Set<number>()

  ctx.lineCap = 'round'
  for (const [a, b] of BONES) {
    const pa = pose[a], pb = pose[b]
    const low = Math.min(vis(pa), vis(pb)) < LOW_VIS
    ctx.strokeStyle = low ? 'rgba(255,255,255,0.35)' : used.has(a) && used.has(b) ? '#3987e5' : 'rgba(255,255,255,0.85)'
    ctx.lineWidth = (used.has(a) && used.has(b) ? 6 : 4) * unit
    ctx.beginPath()
    ctx.moveTo(pa.x * w, pa.y * h)
    ctx.lineTo(pb.x * w, pb.y * h)
    ctx.stroke()
  }

  ctx.font = `600 ${Math.round(14 * unit)}px ui-monospace, monospace`
  for (const { index } of BODY_POINTS) {
    const p = pose[index]
    const v = vis(p)
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 7 * unit, 0, Math.PI * 2)
    ctx.fillStyle = visColor(v)
    ctx.fill()
    ctx.lineWidth = 2 * unit
    ctx.strokeStyle = '#000'
    ctx.stroke()
    if (showLabels) {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3 * unit
      const label = v.toFixed(2)
      ctx.strokeText(label, p.x * w + 10 * unit, p.y * h - 8 * unit)
      ctx.fillText(label, p.x * w + 10 * unit, p.y * h - 8 * unit)
    }
  }

  if (angles) drawAngles(ctx, angles, unit)
}

function drawAngles(ctx: CanvasRenderingContext2D, a: PoseAngles, unit: number) {
  const rows: [string, number][] = [['Elbow', a.elbow], ['Hip', a.hip], ['Knee', a.knee]]
  const size = Math.round(56 * unit)
  const pad = 16 * unit
  const boxW = 330 * unit
  const boxH = pad * 2 + rows.length * size * 1.1 + 26 * unit
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(pad, pad, boxW, boxH)
  ctx.fillStyle = '#c3c2b7'
  ctx.font = `600 ${Math.round(20 * unit)}px system-ui, sans-serif`
  ctx.fillText(`${a.side} side · vis ${a.visibility.toFixed(2)}`, pad * 2, pad + 30 * unit)
  rows.forEach(([name, value], i) => {
    const y = pad + 26 * unit + pad + (i + 1) * size * 1.05
    ctx.fillStyle = '#c3c2b7'
    ctx.font = `600 ${Math.round(size * 0.5)}px system-ui, sans-serif`
    ctx.fillText(name, pad * 2, y)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${size}px ui-monospace, monospace`
    ctx.fillText(Number.isFinite(value) ? `${Math.round(value)}°` : '—', pad * 2 + 130 * unit, y)
  })
}
