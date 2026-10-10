import { describe, it, expect } from 'vitest'
import { DIFFICULTY, RepJudge, type RepResult } from '../judge'
import { computeAngles, type Landmark, type PoseAngles } from '../pose'
import { createPostureTracker, POSTURE } from '../posture'

/** A PoseAngles for a side-on player. Defaults: plank at the top, hands planted at y=0.7. */
function frame(o: Partial<PoseAngles> & { shoulderY?: number } = {}): PoseAngles {
  return {
    side: 'left', elbow: 168, hip: 176, hipFlex: 176, abdomen: 176, bodyOffset: 0, knee: 175,
    visibility: 0.9, shoulderY: 0.46, depth: 0.95, trunkTilt: 15, bodyTilt: 12,
    wrist: { x: 0.5, y: 0.7 }, wristVisibility: 0.9, shoulderX: 0.5, armLength: 0.25,
    ...o,
  }
}

const seq = (n: number, f: (i: number) => PoseAngles | null, fps = 30) =>
  Array.from({ length: n }, (_, i) => [(i * 1000) / fps, f(i)] as const)

describe('posture', () => {
  it('sitting upright is never ready, whatever the arms do', () => {
    const p = createPostureTracker()
    for (const [t, a] of seq(300, (i) => frame({ trunkTilt: 85, bodyTilt: 60, elbow: 100 + 60 * Math.sin(i / 5) }))) {
      expect(p.update(t, a).ready).toBe(false)
    }
    expect(p.update(10_000, frame({ trunkTilt: 85, bodyTilt: 60 })).state).toBe('not-down')
  })

  it('becomes ready after holding the top still for half a second', () => {
    const p = createPostureTracker()
    const states = seq(30, () => frame()).map(([t, a]) => p.update(t, a))
    expect(states[5].state).toBe('settle')
    expect(states.at(-1)!.ready).toBe(true)
    expect(states.at(-1)!.height).toBeCloseTo((0.7 - 0.46) / 0.25)
  })

  it('does not get ready with bent arms or moving hands', () => {
    const bent = createPostureTracker()
    expect(seq(60, () => frame({ depth: 0.4 })).map(([t, a]) => bent.update(t, a)).some((s) => s.ready)).toBe(false)
    const moving = createPostureTracker()
    expect(seq(60, (i) => frame({ wrist: { x: 0.5, y: 0.7 + 0.03 * Math.sin(i) } })).map(([t, a]) => moving.update(t, a)).some((s) => s.ready)).toBe(false)
  })

  it('hands off the floor, or hidden, is not ready', () => {
    const p = createPostureTracker()
    expect(p.update(0, frame({ wrist: { x: 0.5, y: 0.3 } })).state).toBe('hands-off-floor')
    expect(p.update(33, frame({ wristVisibility: 0.1 })).state).toBe('no-hands')
    expect(p.update(66, null).state).toBe('no-player')
  })

  it('stays ready through a short tracking blip, then drops when the player sits up', () => {
    const p = createPostureTracker()
    let t = 0
    for (; t < 1000; t += 33) p.update(t, frame())
    expect(p.update(t, frame()).ready).toBe(true)
    expect(p.update(t + 100, null).ready).toBe(true) // within the grace period
    let last = p.update(t + 200, frame())
    for (let k = 1; k <= 30; k++) last = p.update(t + 200 + k * 33, frame({ trunkTilt: 80, bodyTilt: 60 }))
    expect(last.ready).toBe(false)
  })

  it('a hand lifted off its planted spot ends ready after the grace period', () => {
    const p = createPostureTracker()
    let t = 0
    for (; t < 1000; t += 33) p.update(t, frame())
    let last = p.update(t, frame())
    for (let k = 1; k <= 30; k++) last = p.update(t + k * 33, frame({ wrist: { x: 0.5, y: 0.7 - POSTURE.handDrift * 2 } }))
    expect(last.ready).toBe(false)
  })
})

describe('posture + judge: the reported bug', () => {
  const judge = (frames: (readonly [number, PoseAngles | null])[]) => {
    const p = createPostureTracker()
    const j = new RepJudge(DIFFICULTY.normal)
    const out: RepResult[] = []
    for (const [t, a] of frames) {
      const s = p.update(t, a)
      const r = j.push(t, a && { elbow: a.elbow, hip: a.abdomen, knee: a.knee, bodyOffset: a.bodyOffset, depth: s.height, shoulderY: a.shoulderY, ready: s.ready })
      if (r) out.push(r)
    }
    const last = j.finish()
    if (last) out.push(last)
    return out
  }

  it('sitting still with noisy or moving arms counts nothing', () => {
    // Sitting: trunk upright. Elbow readings swing as the arms rest, shoulder bobs slightly.
    const rs = judge(seq(600, (i) => frame({ trunkTilt: 82, bodyTilt: 55, elbow: 120 + 45 * Math.sin(i / 7), shoulderY: 0.3 + 0.03 * Math.sin(i / 7), depth: 0.8 + 0.3 * Math.sin(i / 7) })))
    expect(rs).toHaveLength(0)
  })

  it('holding a plank without moving counts nothing, even with elbow tracking noise', () => {
    let s = 7
    const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 12
    expect(judge(seq(600, () => frame({ elbow: 165 + noise() })))).toHaveLength(0)
  })

  it('real push-ups after getting into position count, judged from the floor line', () => {
    const frames: [number, PoseAngles][] = []
    let t = 0
    const push = (a: PoseAngles) => { frames.push([t, a]); t += 33 }
    for (let i = 0; i < 30; i++) push(frame({ trunkTilt: 80, bodyTilt: 55 })) // sitting
    for (let i = 0; i < 30; i++) push(frame()) // into position, still
    for (let r = 0; r < 5; r++) {
      for (let k = 0; k <= 30; k++) {
        const u = Math.sin((Math.PI * k) / 30) // 0 → 1 → 0
        push(frame({ elbow: 168 - 98 * u, shoulderY: 0.46 + 0.19 * u, depth: 0.95 - 0.75 * u, trunkTilt: 15 - 10 * u }))
      }
    }
    for (let i = 0; i < 30; i++) push(frame())
    const rs = judge(frames)
    expect(rs).toHaveLength(5)
    expect(rs.every((r) => r.perfect)).toBe(true)
  })

  it('sitting up in the middle of a rep drops it', () => {
    const frames: [number, PoseAngles][] = []
    let t = 0
    const push = (a: PoseAngles) => { frames.push([t, a]); t += 33 }
    for (let i = 0; i < 30; i++) push(frame())
    for (let k = 0; k <= 15; k++) push(frame({ elbow: 168 - 6 * k, shoulderY: 0.46 + 0.012 * k }))
    for (let i = 0; i < 60; i++) push(frame({ trunkTilt: 80, bodyTilt: 55, elbow: 140 }))
    expect(judge(frames)).toHaveLength(0)
  })
})

describe('torso: abdominal point and knees', () => {
  // Side-on landmarks: shoulder, elbow, wrist, hip, knee, ankle for the left side.
  const pose = (hipY: number, kneeY = 0.5): Landmark[] => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }))
    const set = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 0.9 } }
    set(11, 0.2, 0.5); set(13, 0.2, 0.62); set(15, 0.2, 0.74)
    set(23, 0.5, hipY); set(25, 0.65, kneeY); set(27, 0.8, 0.5)
    return lm
  }

  it('a straight body reads ~180° at the abdomen with no offset', () => {
    const a = computeAngles(pose(0.5), 'left')
    expect(a.abdomen).toBeCloseTo(180, 0)
    expect(a.bodyOffset).toBeCloseTo(0, 5)
    expect(a.trunkTilt).toBeCloseTo(0, 5)
  })

  it('sagging hips: positive offset, bent body line', () => {
    const a = computeAngles(pose(0.56, 0.53), 'left')
    expect(a.bodyOffset).toBeGreaterThan(0)
    expect(a.abdomen).toBeLessThan(172)
  })

  it('piked hips: negative offset', () => {
    expect(computeAngles(pose(0.4, 0.46), 'left').bodyOffset).toBeLessThan(0)
  })

  it('the judge names sag vs pike and fails bent knees', () => {
    const run = (o: Partial<{ hip: number; knee: number; bodyOffset: number }>) => {
      const j = new RepJudge(DIFFICULTY.normal)
      let r: RepResult | null = null
      for (let k = 0; k <= 60; k++) {
        const u = k < 10 ? 0 : k > 50 ? 0 : Math.sin((Math.PI * (k - 10)) / 40)
        r = j.push(k * 33, { elbow: 168 - 98 * u, hip: 176, knee: 175, depth: 0.95 - 0.75 * u, shoulderY: 0.46 + 0.19 * u, ...o }) ?? r
      }
      return r ?? j.finish()
    }
    expect(run({ hip: 140, bodyOffset: 0.05 })!.faults.join()).toMatch(/hips sagging/)
    expect(run({ hip: 140, bodyOffset: -0.05 })!.faults.join()).toMatch(/hips piked/)
    const knees = run({ knee: 120 })!
    expect(knees.lights.torso).toBe(false)
    expect(knees.faults.join()).toMatch(/Knees bent/)
  })
})

describe('plank only: knees off the floor', () => {
  it('kneeling in push-up position is never ready', () => {
    const p = createPostureTracker()
    const states = seq(90, () => frame({ knee: 105, bodyTilt: 20 })).map(([t, a]) => p.update(t, a))
    expect(states.some((s) => s.ready)).toBe(false)
    expect(states.at(-1)!.state).toBe('knees-down')
  })

  it('dropping to the knees mid-set ends ready after the grace period', () => {
    const p = createPostureTracker()
    let t = 0
    for (; t < 1000; t += 33) p.update(t, frame())
    expect(p.update(t, frame()).ready).toBe(true)
    let last = p.update(t, frame())
    for (let k = 1; k <= 30; k++) last = p.update(t + k * 33, frame({ knee: 100 }))
    expect(last.ready).toBe(false)
    expect(last.state).toBe('knees-down')
  })

  it('slightly soft knees in a plank (155°) are fine', () => {
    const p = createPostureTracker()
    expect(seq(40, () => frame({ knee: 155 })).map(([t, a]) => p.update(t, a)).at(-1)!.ready).toBe(true)
  })
})
