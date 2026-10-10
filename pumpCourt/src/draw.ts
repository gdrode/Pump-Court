// Overlay drawing only: the skeleton of the tracked side. No numbers are drawn
// on the camera view; angles live in the diagnostics panel.
import { SIDE_BONES, SIDE_POINTS, type Landmark, type Side } from './pose'

export function drawOverlay(ctx: CanvasRenderingContext2D, pose: Landmark[] | undefined, side: Side | null) {
  const { width: w, height: h } = ctx.canvas
  ctx.clearRect(0, 0, w, h)
  if (!pose || !side) return
  const unit = h / 720
  const pts = SIDE_POINTS[side]

  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 6 * unit
  ctx.beginPath()
  for (const [a, b] of SIDE_BONES) {
    const pa = pose[pts[a]], pb = pose[pts[b]]
    ctx.moveTo(pa.x * w, pa.y * h)
    ctx.lineTo(pb.x * w, pb.y * h)
  }
  ctx.stroke()

  ctx.fillStyle = '#3987e5'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2 * unit
  for (const i of Object.values(pts)) {
    ctx.beginPath()
    ctx.arc(pose[i].x * w, pose[i].y * h, 8 * unit, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
