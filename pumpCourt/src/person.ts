// Plain TypeScript: which person to track when the camera sees several (a
// crowded venue). MediaPipe returns up to PERSON.maxPeople bodies per frame;
// this keeps following the same one from frame to frame, by where they are,
// and on "recalibrate" drops them for the next best player: the one closest
// to the camera, lying most like the push-up starting position on the floor.
import { pickSide, SIDE_POINTS, vis, type Landmark } from './pose'

export const PERSON = {
  /** Bodies MediaPipe looks for in each frame. */
  maxPeople: 3,
  /** Points under this visibility are ignored when measuring a body. */
  minVisibility: 0.3,
  /** The same person in the next frame: their centre moved less than this many body sizes. */
  matchDistance: 0.6,
  /** ...and their size changed less than this factor. */
  matchScale: 1.8,
  /** The tracked person unseen this long: lock onto whoever is best placed instead. */
  lostMs: 1500,
}

/** Where a body is, in frame-height units (x scaled by the picture's aspect). */
export interface Body {
  cx: number
  cy: number
  /** Diagonal of the box around its visible points: bigger = closer to the camera. */
  size: number
}

const BODY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

export function bodyOf(pose: Landmark[], aspect: number): Body | null {
  const pts = BODY_POINTS.map((i) => pose[i]).filter((p) => p && vis(p) >= PERSON.minVisibility)
  if (pts.length < 4) return null
  const xs = pts.map((p) => p.x * aspect)
  const ys = pts.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.hypot(x1 - x0, y1 - y0) }
}

/**
 * How well a body fits "the next player, ready to start", 0 or more:
 * close to the camera (big), body level (shoulder to ankle near horizontal),
 * hands below the shoulders, low in the picture (on the floor), clearly seen.
 */
export function startScore(pose: Landmark[], aspect: number): number {
  const body = bodyOf(pose, aspect)
  if (!body) return 0
  const s = SIDE_POINTS[pickSide(pose)]
  const [sh, hip, ankle, wrist] = [pose[s.shoulder], pose[s.hip], pose[s.ankle], pose[s.wrist]]
  const seen = [sh, hip, ankle, wrist].reduce((n, p) => n + vis(p), 0) / 4
  const tilt = Math.abs((Math.atan2(ankle.y - sh.y, (ankle.x - sh.x) * aspect) * 180) / Math.PI)
  const level = 1 - Math.min(tilt, 180 - tilt) / 90 // 1 = flat, 0 = standing
  const handsDown = wrist.y > sh.y ? 1 : 0
  const low = Math.min(1, Math.max(0, hip.y))
  return seen * (2 * body.size + 1.5 * level + 0.5 * handsDown + 0.5 * low)
}

export interface PersonPick {
  /** The tracked person's landmarks, or undefined (nobody, or they are momentarily lost). */
  pose: Landmark[] | undefined
  /** A different person than last frame: start the side and posture trackers fresh. */
  switched: boolean
}

/** Follows one person across frames. `recalibrate()` swaps to the next best on the next frame. */
export function createPersonLock() {
  let anchor: Body | null = null
  let lastSeen = -Infinity
  let recalibrate = false

  const best = (poses: Landmark[][], aspect: number, skip = -1) => {
    let at = -1
    let top = 0
    poses.forEach((p, i) => {
      if (i === skip) return
      const sc = startScore(p, aspect)
      if (sc > top) [at, top] = [i, sc]
    })
    return at
  }

  /** Index of the pose that is the anchored person, or -1. */
  const follow = (bodies: (Body | null)[]) => {
    if (!anchor) return -1
    let at = -1
    let near = Infinity
    bodies.forEach((b, i) => {
      if (!b || !anchor) return
      const scale = Math.max(b.size, anchor.size) / Math.max(1e-6, Math.min(b.size, anchor.size))
      const d = Math.hypot(b.cx - anchor.cx, b.cy - anchor.cy) / Math.max(1e-6, anchor.size)
      if (scale <= PERSON.matchScale && d <= PERSON.matchDistance && d < near) [at, near] = [i, d]
    })
    return at
  }

  return {
    pick(poses: Landmark[][], aspect: number, t: number): PersonPick {
      const bodies = poses.map((p) => bodyOf(p, aspect))
      const was = anchor
      let at: number
      const recalibrated = recalibrate
      if (recalibrate) {
        recalibrate = false
        // Anyone but the current person; if they are the only one, keep them.
        const current = follow(bodies)
        at = best(poses, aspect, current)
        if (at < 0) at = current
      } else {
        at = follow(bodies)
        if (at < 0 && (!anchor || t - lastSeen > PERSON.lostMs)) at = best(poses, aspect)
      }
      if (at < 0 || !bodies[at]) {
        // Recalibrated with nobody in view: take whoever is best placed next.
        if (was && recalibrated) anchor = null
        return { pose: undefined, switched: false }
      }
      const switched = was === null || follow([bodies[at]]) !== 0
      anchor = bodies[at]
      lastSeen = t
      return { pose: poses[at], switched }
    },
    /** Next frame: drop the current person for the best other one. */
    recalibrate() {
      recalibrate = true
    },
    reset() {
      anchor = null
      lastSeen = -Infinity
    },
  }
}
