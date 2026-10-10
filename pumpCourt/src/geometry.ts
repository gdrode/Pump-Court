export interface Point2 {
  x: number
  y: number
}

/** Angle at b, in degrees, formed by the segments b->a and b->c. Returns NaN for zero-length segments. */
export function angle(a: Point2, b: Point2, c: Point2) {
  const abx = a.x - b.x, aby = a.y - b.y
  const cbx = c.x - b.x, cby = c.y - b.y
  const dot = abx * cbx + aby * cby
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby)
  if (mag === 0) return NaN
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI)
}
