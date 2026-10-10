// Plain TypeScript: turns 33 MediaPipe landmarks into the angles the referee
// rules use. No camera or drawing code belongs here.
import { angle } from './geometry'

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export type Side = 'left' | 'right'
export type SideMode = Side | 'auto'

// MediaPipe Pose numbering.
export const LM = {
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
} as const

export const SIDE_POINTS: Record<Side, { shoulder: number; elbow: number; wrist: number; hip: number; knee: number; ankle: number }> = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
}

/** Body points shown on the overlay, with their labels for the debug panel. */
export const BODY_POINTS: { index: number; name: string }[] = [
  { index: 11, name: 'L shoulder' }, { index: 12, name: 'R shoulder' },
  { index: 13, name: 'L elbow' }, { index: 14, name: 'R elbow' },
  { index: 15, name: 'L wrist' }, { index: 16, name: 'R wrist' },
  { index: 23, name: 'L hip' }, { index: 24, name: 'R hip' },
  { index: 25, name: 'L knee' }, { index: 26, name: 'R knee' },
  { index: 27, name: 'L ankle' }, { index: 28, name: 'R ankle' },
]

/** Bones drawn between body points. */
export const BONES: [number, number][] = [
  [11, 12], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
]

export function vis(p: Landmark | undefined) {
  return p?.visibility ?? 0
}

/** Mean visibility of the six points one side uses for its angles. */
export function sideVisibility(pose: Landmark[], side: Side) {
  const pts = Object.values(SIDE_POINTS[side])
  return pts.reduce((sum, i) => sum + vis(pose[i]), 0) / pts.length
}

export function pickSide(pose: Landmark[], mode: SideMode): Side {
  if (mode !== 'auto') return mode
  return sideVisibility(pose, 'left') >= sideVisibility(pose, 'right') ? 'left' : 'right'
}

export interface PoseAngles {
  side: Side
  elbow: number
  hip: number
  knee: number
  /** Mean visibility of the points used, 0..1. */
  visibility: number
  /** Average of both shoulders' y, normalised 0 (top) .. 1 (bottom). Larger = lower. */
  shoulderY: number
}

/**
 * `aspect` is video width / height. Landmarks are normalised to the frame, so
 * x is scaled by it to get true angles on a non-square frame.
 */
export function computeAngles(pose: Landmark[], mode: SideMode, aspect = 1): PoseAngles {
  const side = pickSide(pose, mode)
  const s = SIDE_POINTS[side]
  const p = (i: number) => ({ x: pose[i].x * aspect, y: pose[i].y })
  return {
    side,
    elbow: angle(p(s.shoulder), p(s.elbow), p(s.wrist)),
    hip: angle(p(s.shoulder), p(s.hip), p(s.ankle)),
    knee: angle(p(s.hip), p(s.knee), p(s.ankle)),
    visibility: sideVisibility(pose, side),
    shoulderY: (pose[LM.leftShoulder].y + pose[LM.rightShoulder].y) / 2,
  }
}
