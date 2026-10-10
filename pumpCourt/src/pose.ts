// Plain TypeScript: turns 33 MediaPipe landmarks into the angles the referee
// rules use. No camera or drawing code belongs here.
//
// The camera is side-on, so only the side nearest the camera is tracked. The
// far side is mostly hidden behind the body and is ignored entirely.
import { angle, type Point2 } from './geometry'

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export type Side = 'left' | 'right'

export const SIDE_POINTS: Record<Side, { shoulder: number; elbow: number; wrist: number; hip: number; knee: number; ankle: number }> = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
}

/** Bones drawn for the tracked side, by role. */
export const SIDE_BONES: [keyof (typeof SIDE_POINTS)['left'], keyof (typeof SIDE_POINTS)['left']][] = [
  ['shoulder', 'elbow'], ['elbow', 'wrist'],
  ['shoulder', 'hip'], ['hip', 'knee'], ['knee', 'ankle'],
]

/** Below this mean visibility the tracked side is too unreliable to judge. */
export const MIN_SIDE_VISIBILITY = 0.5

/** The other side must beat the current one by this much before we switch, so the choice doesn't flicker. */
export const SIDE_SWITCH_MARGIN = 0.15

export function vis(p: Landmark | undefined) {
  return p?.visibility ?? 0
}

/** Mean visibility of the six points one side uses for its angles. */
export function sideVisibility(pose: Landmark[], side: Side) {
  const pts = Object.values(SIDE_POINTS[side])
  return pts.reduce((sum, i) => sum + vis(pose[i]), 0) / pts.length
}

/** The more visible side, sticking with `previous` unless the other side is clearly better. */
export function pickSide(pose: Landmark[], previous: Side | null = null): Side {
  const left = sideVisibility(pose, 'left')
  const right = sideVisibility(pose, 'right')
  if (previous === 'left' && right < left + SIDE_SWITCH_MARGIN) return 'left'
  if (previous === 'right' && left < right + SIDE_SWITCH_MARGIN) return 'right'
  return left >= right ? 'left' : 'right'
}

/**
 * The abdominal point sits this far down the trunk, from shoulder (0) to hip
 * (1): over the abdomen, where the trunk folds when the hips pike or the belly
 * sags. MediaPipe has no spine points, so it is placed along the shoulder–hip
 * line and judged against the legs.
 */
export const ABDOMEN_FRACTION = 0.6

export interface PoseAngles {
  side: Side
  elbow: number
  /** Body line at the hips: shoulder–hip–ankle. */
  hip: number
  /** Hip flexion: shoulder–hip–knee. */
  hipFlex: number
  /** Body line at the abdominal point: shoulder–abdomen–knee. 180 = trunk in line with the thighs. */
  abdomen: number
  /**
   * How far the abdominal point sits off the straight shoulder–ankle line, as
   * a fraction of that line's length. Positive = below it (belly sagging),
   * negative = above it (hips piked).
   */
  bodyOffset: number
  knee: number
  /** Mean visibility of the tracked side's points, 0..1. */
  visibility: number
  /** Tracked shoulder's y, normalised 0 (top) .. 1 (bottom). Larger = lower. */
  shoulderY: number
  /**
   * Shoulder height above the hands, as a fraction of arm length. The hands
   * are on the floor, so about 1 at full lockout and near 0 with the chest on
   * the floor.
   */
  depth: number
  /** Degrees the trunk (shoulder to hip) tilts from horizontal: about 0–30 in a push-up, near 90 sitting or standing. */
  trunkTilt: number
  /** Degrees the whole body (shoulder to ankle) tilts from horizontal. */
  bodyTilt: number
  /** Tracked wrist, in frame units with x scaled by the aspect ratio (y: 0 top .. 1 bottom). */
  wrist: Point2
  wristVisibility: number
  shoulderX: number
  /** Shoulder to elbow to wrist, in the same units. */
  armLength: number
}

const tilt = (a: Point2, b: Point2) => {
  const deg = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI))
  return deg > 90 ? 180 - deg : deg
}

/**
 * Angles for one side. `aspect` is video width / height: landmarks are
 * normalised to the frame, so x is scaled by it to get true angles.
 */
export function computeAngles(pose: Landmark[], side: Side, aspect = 1): PoseAngles {
  const s = SIDE_POINTS[side]
  const p = (i: number): Point2 => ({ x: pose[i].x * aspect, y: pose[i].y })
  const sh = p(s.shoulder), el = p(s.elbow), wr = p(s.wrist), hp = p(s.hip), kn = p(s.knee), an = p(s.ankle)
  const ab = { x: sh.x + (hp.x - sh.x) * ABDOMEN_FRACTION, y: sh.y + (hp.y - sh.y) * ABDOMEN_FRACTION }
  const armLength = Math.hypot(sh.x - el.x, sh.y - el.y) + Math.hypot(el.x - wr.x, el.y - wr.y)
  // Signed distance of the abdominal point from the shoulder–ankle line; y grows downwards, so below = positive.
  const lx = an.x - sh.x, ly = an.y - sh.y, len = Math.hypot(lx, ly)
  const cross = (lx * (ab.y - sh.y) - ly * (ab.x - sh.x)) / (len || NaN)
  const bodyOffset = (lx >= 0 ? cross : -cross) / (len || NaN)
  return {
    side,
    elbow: angle(sh, el, wr),
    hip: angle(sh, hp, an),
    hipFlex: angle(sh, hp, kn),
    abdomen: angle(sh, ab, kn),
    bodyOffset,
    knee: angle(hp, kn, an),
    visibility: sideVisibility(pose, side),
    shoulderY: sh.y,
    depth: armLength > 0 ? (wr.y - sh.y) / armLength : NaN,
    trunkTilt: tilt(sh, hp),
    bodyTilt: tilt(sh, an),
    wrist: wr,
    wristVisibility: vis(pose[s.wrist]),
    shoulderX: sh.x,
    armLength,
  }
}

/** Tracks the side across frames. Returns null when neither side is visible enough to judge. */
export function createSideTracker() {
  let side: Side | null = null
  return {
    update(pose: Landmark[] | undefined, aspect: number): PoseAngles | null {
      if (!pose) return null
      side = pickSide(pose, side)
      const a = computeAngles(pose, side, aspect)
      return a.visibility >= MIN_SIDE_VISIBILITY ? a : null
    },
    get side() { return side },
  }
}
