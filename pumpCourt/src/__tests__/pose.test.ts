import { describe, it, expect } from 'vitest'
import {
  computeAngles, createSideTracker, pickSide, sideVisibility, vis,
  MIN_SIDE_VISIBILITY, SIDE_POINTS, SIDE_SWITCH_MARGIN, type Landmark, type Side,
} from '../pose'

type XY = [number, number]
interface SidePts { shoulder: XY; elbow: XY; wrist: XY; hip: XY; knee: XY; ankle: XY }

/**
 * Side-on push-up in "true" frame units (x in 0..aspect, y in 0..1),
 * converted to MediaPipe-normalised coords by dividing x by aspect.
 * Left side: elbow 90 deg (diagonal arms so x-scaling changes it), straight body.
 */
const LEFT_BOTTOM: SidePts = {
  shoulder: [0.3, 0.4],
  elbow: [0.4, 0.5],
  wrist: [0.3, 0.6],
  hip: [0.6, 0.475],
  knee: [0.75, 0.5125],
  ankle: [0.9, 0.55],
}
// Shoulder->hip->ankle collinear above: (0.3,0.4) -> (0.6,0.475) -> (0.9,0.55), slope 0.25.

/** Right side: straight arm, so we can tell which side was used. */
const RIGHT_TOP: SidePts = {
  shoulder: [0.32, 0.44],
  elbow: [0.32, 0.54],
  wrist: [0.32, 0.64],
  hip: [0.62, 0.5],
  knee: [0.77, 0.53],
  ankle: [0.92, 0.56],
}

function makePose(o: {
  left?: SidePts
  right?: SidePts
  leftVis?: number
  rightVis?: number
  aspect?: number
}): Landmark[] {
  const aspect = o.aspect ?? 1
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }))
  const put = (side: Side, pts: SidePts, v: number) => {
    for (const k of Object.keys(SIDE_POINTS[side]) as (keyof SidePts)[]) {
      const [x, y] = pts[k]
      pose[SIDE_POINTS[side][k]] = { x: x / aspect, y, z: 0, visibility: v }
    }
  }
  put('left', o.left ?? LEFT_BOTTOM, o.leftVis ?? 0.95)
  put('right', o.right ?? RIGHT_TOP, o.rightVis ?? 0.4)
  return pose
}

describe('pose.vis / sideVisibility', () => {
  it('missing visibility counts as 0', () => {
    expect(vis(undefined)).toBe(0)
    expect(vis({ x: 0, y: 0, z: 0 })).toBe(0)
    expect(vis({ x: 0, y: 0, z: 0, visibility: 0.7 })).toBe(0.7)
  })

  it('is the mean over the six side points', () => {
    const pose = makePose({ leftVis: 0.9, rightVis: 0.3 })
    pose[SIDE_POINTS.left.ankle].visibility = 0.3 // (5*0.9 + 0.3) / 6 = 0.8
    expect(sideVisibility(pose, 'left')).toBeCloseTo(0.8, 10)
    expect(sideVisibility(pose, 'right')).toBeCloseTo(0.3, 10)
  })
})

describe('pose.pickSide', () => {
  it('first frame (no previous) picks the more visible side', () => {
    expect(pickSide(makePose({ leftVis: 0.9, rightVis: 0.4 }))).toBe('left')
    expect(pickSide(makePose({ leftVis: 0.4, rightVis: 0.9 }))).toBe('right')
    expect(pickSide(makePose({ leftVis: 0.4, rightVis: 0.9 }), null)).toBe('right')
  })

  it('first-frame ties go to left', () => {
    expect(pickSide(makePose({ leftVis: 0.6, rightVis: 0.6 }))).toBe('left')
  })

  it('stays on the current side unless the other is better by more than the margin', () => {
    const slightlyBetter = SIDE_SWITCH_MARGIN / 2
    expect(pickSide(makePose({ leftVis: 0.6, rightVis: 0.6 + slightlyBetter }), 'left')).toBe('left')
    expect(pickSide(makePose({ leftVis: 0.6 + slightlyBetter, rightVis: 0.6 }), 'right')).toBe('right')
    // Equal: stay.
    expect(pickSide(makePose({ leftVis: 0.7, rightVis: 0.7 }), 'right')).toBe('right')
    // Current side is better: obviously stay.
    expect(pickSide(makePose({ leftVis: 0.9, rightVis: 0.3 }), 'left')).toBe('left')
  })

  it('switches when the other side is better by more than the margin', () => {
    const clearlyBetter = SIDE_SWITCH_MARGIN + 0.05
    expect(pickSide(makePose({ leftVis: 0.5, rightVis: 0.5 + clearlyBetter }), 'left')).toBe('right')
    expect(pickSide(makePose({ leftVis: 0.5 + clearlyBetter, rightVis: 0.5 }), 'right')).toBe('left')
  })
})

describe('pose.computeAngles', () => {
  it('left side bottom: elbow 90, hip 180, knee 180', () => {
    const a = computeAngles(makePose({}), 'left')
    expect(a.side).toBe('left')
    expect(a.elbow).toBeCloseTo(90, 6)
    expect(a.hip).toBeCloseTo(180, 4)
    expect(a.knee).toBeCloseTo(180, 4)
    expect(a.visibility).toBeCloseTo(0.95, 10)
  })

  it('uses exactly the side it is given, regardless of visibility', () => {
    const r = computeAngles(makePose({ leftVis: 0.99, rightVis: 0.1 }), 'right')
    expect(r.side).toBe('right')
    expect(r.elbow).toBeCloseTo(180, 4)
    expect(r.visibility).toBeCloseTo(0.1, 10)
  })

  it('piked hip and bent knee', () => {
    // Hip raised: S(0.3,0.4) H(0.6,0.3) A(0.9,0.55). Knee bent.
    const left: SidePts = { ...LEFT_BOTTOM, hip: [0.6, 0.3], knee: [0.75, 0.35], ankle: [0.9, 0.55] }
    const a = computeAngles(makePose({ left }), 'left')
    const deg = (r: number) => (r * 180) / Math.PI
    const hipExp = deg(Math.atan2(0.1, -0.3)) - deg(Math.atan2(0.25, 0.3)) // angle between H->S and H->A
    expect(a.hip).toBeCloseTo(hipExp, 6)
    const kneeExp = 180 - (deg(Math.atan2(0.2, 0.15)) - deg(Math.atan2(0.05, 0.15)))
    expect(a.knee).toBeCloseTo(kneeExp, 6)
    expect(a.hip).toBeLessThan(150)
    expect(a.knee).toBeLessThan(170)
  })

  it('aspect ratio: a true 90 deg on a 16:9 frame only reads 90 when aspect is passed', () => {
    const aspect = 16 / 9
    const pose = makePose({ aspect })
    const correct = computeAngles(pose, 'left', aspect)
    expect(correct.elbow).toBeCloseTo(90, 6)
    expect(correct.hip).toBeCloseTo(180, 4)

    const naive = computeAngles(pose, 'left') // aspect defaults to 1
    expect(Math.abs(naive.elbow - 90)).toBeGreaterThan(20)
    const expNaive = 2 * (Math.atan2(0.1, 0.1 / aspect) * 180) / Math.PI
    expect(naive.elbow).toBeCloseTo(expNaive, 6)
    // Collinear points stay collinear under axis scaling.
    expect(naive.hip).toBeCloseTo(180, 4)
  })

  it('axis-aligned right angles survive aspect scaling either way', () => {
    const left: SidePts = { ...LEFT_BOTTOM, shoulder: [0.4, 0.4], elbow: [0.4, 0.5], wrist: [0.55, 0.5] }
    const pose = makePose({ left, aspect: 16 / 9 })
    expect(computeAngles(pose, 'left', 16 / 9).elbow).toBeCloseTo(90, 6)
    expect(computeAngles(pose, 'left', 1).elbow).toBeCloseTo(90, 6)
  })

  it("shoulderY is the tracked side's shoulder only", () => {
    const pose = makePose({})
    pose[SIDE_POINTS.left.shoulder].y = 0.5
    pose[SIDE_POINTS.right.shoulder].y = 0.54
    expect(computeAngles(pose, 'left').shoulderY).toBeCloseTo(0.5, 10)
    expect(computeAngles(pose, 'right').shoulderY).toBeCloseTo(0.54, 10)
    // y is not affected by aspect.
    expect(computeAngles(pose, 'left', 16 / 9).shoulderY).toBeCloseTo(0.5, 10)
  })

  it('coincident landmarks give NaN rather than throwing', () => {
    const left: SidePts = { ...LEFT_BOTTOM, wrist: LEFT_BOTTOM.elbow }
    expect(computeAngles(makePose({ left }), 'left').elbow).toBeNaN()
  })
})

describe('pose.computeAngles depth', () => {
  it('is ~1 with a straight vertical arm (lockout)', () => {
    const left: SidePts = { ...LEFT_BOTTOM, shoulder: [0.3, 0.3], elbow: [0.3, 0.45], wrist: [0.3, 0.6] }
    expect(computeAngles(makePose({ left }), 'left').depth).toBeCloseTo(1, 10)
    // The straight right arm in RIGHT_TOP too.
    expect(computeAngles(makePose({}), 'right').depth).toBeCloseTo(1, 10)
  })

  it('is small with the shoulder near wrist height (chest to floor)', () => {
    const left: SidePts = { ...LEFT_BOTTOM, shoulder: [0.3, 0.58], elbow: [0.4, 0.5], wrist: [0.35, 0.6] }
    const d = computeAngles(makePose({ left }), 'left').depth
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(0.15)
  })

  it('is the vertical drop over the bent arm length', () => {
    // Bottom pose: drop 0.2, arm 2*sqrt(0.02).
    expect(computeAngles(makePose({}), 'left').depth).toBeCloseTo(0.2 / (2 * Math.sqrt(0.02)), 10)
  })

  it('uses aspect-corrected arm length', () => {
    const aspect = 16 / 9
    const pose = makePose({ aspect })
    const expected = 0.2 / (2 * Math.sqrt(0.02))
    expect(computeAngles(pose, 'left', aspect).depth).toBeCloseTo(expected, 10)
    // Without the aspect, x is squashed, arm looks shorter and depth is overstated.
    const naiveArm = 2 * Math.hypot(0.1 / aspect, 0.1)
    const naive = computeAngles(pose, 'left').depth
    expect(naive).toBeCloseTo(0.2 / naiveArm, 10)
    expect(naive).toBeGreaterThan(expected + 0.05)
  })

  it('is NaN when the arm has zero length', () => {
    const left: SidePts = { ...LEFT_BOTTOM, elbow: LEFT_BOTTOM.shoulder, wrist: LEFT_BOTTOM.shoulder }
    expect(computeAngles(makePose({ left }), 'left').depth).toBeNaN()
  })
})

describe('pose.createSideTracker', () => {
  it('returns null for a missing pose', () => {
    const t = createSideTracker()
    expect(t.update(undefined, 1)).toBeNull()
    expect(t.side).toBeNull()
  })

  it('picks the more visible side on the first frame and sticks with it (hysteresis)', () => {
    const t = createSideTracker()
    expect(t.update(makePose({ leftVis: 0.9, rightVis: 0.4 }), 1)?.side).toBe('left')
    expect(t.side).toBe('left')
    // Right slightly better, within margin: stay left.
    expect(t.update(makePose({ leftVis: 0.7, rightVis: 0.7 + SIDE_SWITCH_MARGIN / 2 }), 1)?.side).toBe('left')
    // Right clearly better: switch.
    expect(t.update(makePose({ leftVis: 0.6, rightVis: 0.95 }), 1)?.side).toBe('right')
    expect(t.side).toBe('right')
  })

  it('returns null when the tracked side is below MIN_SIDE_VISIBILITY, then recovers', () => {
    const t = createSideTracker()
    const low = MIN_SIDE_VISIBILITY - 0.1
    expect(t.update(makePose({ leftVis: 0.9, rightVis: 0.2 }), 1)).not.toBeNull()
    expect(t.update(makePose({ leftVis: low, rightVis: low }), 1)).toBeNull()
    const back = t.update(makePose({ leftVis: 0.9, rightVis: 0.2 }), 1)
    expect(back).not.toBeNull()
    expect(back?.side).toBe('left')
    expect(back?.elbow).toBeCloseTo(90, 6)
  })

  it('is null exactly below the threshold and non-null at it', () => {
    const t = createSideTracker()
    expect(t.update(makePose({ leftVis: MIN_SIDE_VISIBILITY, rightVis: 0.1 }), 1)).not.toBeNull()
    expect(t.update(makePose({ leftVis: MIN_SIDE_VISIBILITY - 0.01, rightVis: 0.1 }), 1)).toBeNull()
  })

  it('passes aspect through to the angles', () => {
    const aspect = 16 / 9
    const t = createSideTracker()
    expect(t.update(makePose({ aspect }), aspect)?.elbow).toBeCloseTo(90, 6)
  })
})
