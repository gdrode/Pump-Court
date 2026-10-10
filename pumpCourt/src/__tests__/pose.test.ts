import { describe, it, expect } from 'vitest'
import { computeAngles, pickSide, sideVisibility, vis, LM, SIDE_POINTS, type Landmark, type Side } from '../pose'

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
    pose[LM.leftAnkle].visibility = 0.3 // (5*0.9 + 0.3) / 6 = 0.8
    expect(sideVisibility(pose, 'left')).toBeCloseTo(0.8, 10)
    expect(sideVisibility(pose, 'right')).toBeCloseTo(0.3, 10)
  })
})

describe('pose.pickSide', () => {
  it("'auto' picks the side with higher visibility", () => {
    expect(pickSide(makePose({ leftVis: 0.9, rightVis: 0.4 }), 'auto')).toBe('left')
    expect(pickSide(makePose({ leftVis: 0.4, rightVis: 0.9 }), 'auto')).toBe('right')
  })

  it("'auto' ties go to left", () => {
    expect(pickSide(makePose({ leftVis: 0.6, rightVis: 0.6 }), 'auto')).toBe('left')
  })

  it('locked modes are respected regardless of visibility', () => {
    const pose = makePose({ leftVis: 0.99, rightVis: 0.01 })
    expect(pickSide(pose, 'right')).toBe('right')
    expect(pickSide(pose, 'left')).toBe('left')
    const pose2 = makePose({ leftVis: 0.01, rightVis: 0.99 })
    expect(pickSide(pose2, 'left')).toBe('left')
  })
})

describe('pose.computeAngles', () => {
  it('left side bottom: elbow 90, hip 180, knee 180', () => {
    const a = computeAngles(makePose({}), 'auto')
    expect(a.side).toBe('left')
    expect(a.elbow).toBeCloseTo(90, 6)
    expect(a.hip).toBeCloseTo(180, 4)
    expect(a.knee).toBeCloseTo(180, 4)
    expect(a.visibility).toBeCloseTo(0.95, 10)
  })

  it('uses the right side when it is more visible (or locked)', () => {
    const auto = computeAngles(makePose({ leftVis: 0.3, rightVis: 0.9 }), 'auto')
    expect(auto.side).toBe('right')
    expect(auto.elbow).toBeCloseTo(180, 4)
    expect(auto.visibility).toBeCloseTo(0.9, 10)

    const locked = computeAngles(makePose({ leftVis: 0.99, rightVis: 0.1 }), 'right')
    expect(locked.side).toBe('right')
    expect(locked.elbow).toBeCloseTo(180, 4)
    expect(locked.visibility).toBeCloseTo(0.1, 10)
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
    // Squashing x by 9/16: vectors (-0.0563,-0.1) and (-0.0563,0.1).
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

  it('shoulderY is the mean of both shoulders, independent of side', () => {
    const pose = makePose({})
    pose[LM.leftShoulder].y = 0.5
    pose[LM.rightShoulder].y = 0.54
    expect(computeAngles(pose, 'left').shoulderY).toBeCloseTo(0.52, 10)
    expect(computeAngles(pose, 'right').shoulderY).toBeCloseTo(0.52, 10)
    expect(computeAngles(pose, 'auto', 16 / 9).shoulderY).toBeCloseTo(0.52, 10)
  })

  it('coincident landmarks give NaN rather than throwing', () => {
    const left: SidePts = { ...LEFT_BOTTOM, wrist: LEFT_BOTTOM.elbow }
    expect(computeAngles(makePose({ left }), 'left').elbow).toBeNaN()
  })
})
