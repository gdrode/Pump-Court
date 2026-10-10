// Plain TypeScript: decides whether the player is in the push-up position at
// all, before any rep is judged. Sitting, standing, kneeling up or walking
// into frame never counts: the trunk must be close to horizontal and the
// hands planted on the floor below the shoulders.
//
// When the player settles at the top with straight arms, the hands' height
// becomes the floor. From then on, how high the shoulders are is measured
// from that fixed floor line, which is steadier than the wrist point itself.
import type { PoseAngles } from './pose'

export const POSTURE = {
  /** The trunk (shoulder to hip) must tilt less than this from horizontal. A sitting or standing trunk is near 90°. */
  maxTrunkTilt: 40,
  /** The whole body (shoulder to ankle) must tilt less than this. */
  maxBodyTilt: 35,
  /** The wrist must be at least this visible to find the floor. */
  minWristVisibility: 0.5,
  /** To get ready, the arms must be close to straight: shoulders this many arm lengths above the hands. */
  readyDepth: 0.7,
  /** ...and held still this long. */
  settleMs: 500,
  /** "Still" = the wrist moves less than this (fraction of frame height) while settling. */
  stillTravel: 0.04,
  /** Once ready, the hands must stay within this of where they were planted (fraction of frame height). */
  handDrift: 0.08,
  /** Losing the position (or the player) for this long ends "ready". */
  graceMs: 600,
}

export type PostureState = 'no-player' | 'no-hands' | 'not-down' | 'hands-off-floor' | 'settle' | 'ready'

export const POSTURE_MESSAGE: Record<PostureState, string> = {
  'no-player': 'Can’t see the player. Get side-on to the camera with the whole body in view.',
  'no-hands': 'Can’t see the hands. Keep the near hand in view.',
  'not-down': 'Get down into the push-up position.',
  'hands-off-floor': 'Put the hands on the floor, under the shoulders.',
  settle: 'Hold still at the top, arms straight, to start.',
  ready: 'Ready. Go!',
}

export interface Posture {
  state: PostureState
  ready: boolean
  /**
   * Shoulder height above the planted hands, in arm lengths: about 1 at the
   * top, near 0 with the chest on the floor. NaN until a floor is known.
   */
  height: number
}

export function createPostureTracker() {
  let ready = false
  let floorY = NaN
  let handX = NaN
  let armLength = NaN
  let lostSince = -Infinity
  // Wrist samples while settling at the top.
  let settle: { t: number; x: number; y: number }[] = []

  const result = (state: PostureState, a: PoseAngles | null): Posture => ({
    state,
    ready,
    height: ready && a && Number.isFinite(floorY) ? (floorY - a.shoulderY) / armLength : NaN,
  })

  /** Why this frame is not a push-up position, or null if it is. */
  const problem = (a: PoseAngles | null): PostureState | null => {
    if (!a) return 'no-player'
    if (!(a.wristVisibility >= POSTURE.minWristVisibility)) return 'no-hands'
    if (!((ready || a.trunkTilt <= POSTURE.maxTrunkTilt) && a.bodyTilt <= POSTURE.maxBodyTilt)) return 'not-down'
    // Hands on the floor: below the shoulders, and not far out in front of them.
    if (!(a.wrist.y > a.shoulderY) || Math.abs(a.wrist.x - a.shoulderX) > a.armLength) return 'hands-off-floor'
    return null
  }

  return {
    update(t: number, a: PoseAngles | null): Posture {
      const bad = problem(a)

      if (ready) {
        const drifted = !bad && a && (Math.abs(a.wrist.y - floorY) > POSTURE.handDrift || Math.abs(a.wrist.x - handX) > POSTURE.handDrift * 2)
        if (!bad && !drifted) {
          lostSince = -Infinity
          return result('ready', a)
        }
        if (!Number.isFinite(lostSince)) lostSince = t
        if (t - lostSince <= POSTURE.graceMs) return result('ready', bad === 'no-hands' ? a : null)
        ready = false
        settle = []
        return result(bad ?? 'hands-off-floor', a)
      }

      if (bad || !a) {
        settle = []
        return result(bad ?? 'no-player', a)
      }
      // In position: wait for straight arms held still, then plant the floor.
      if (!(a.depth >= POSTURE.readyDepth)) {
        settle = []
        return result('settle', a)
      }
      settle.push({ t, x: a.wrist.x, y: a.wrist.y })
      while (settle.length && settle[0].t < t - POSTURE.settleMs) settle.shift()
      const ys = settle.map((s) => s.y), xs = settle.map((s) => s.x)
      const still = Math.max(...ys) - Math.min(...ys) <= POSTURE.stillTravel && Math.max(...xs) - Math.min(...xs) <= POSTURE.stillTravel * 2
      if (!still) settle = [{ t, x: a.wrist.x, y: a.wrist.y }]
      if (!still || t - settle[0].t < POSTURE.settleMs * 0.9) return result('settle', a)

      ready = true
      lostSince = -Infinity
      floorY = median(ys)
      handX = median(xs)
      armLength = a.armLength
      settle = []
      return result('ready', a)
    },
    reset() {
      ready = false
      settle = []
      floorY = NaN
    },
  }
}

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
