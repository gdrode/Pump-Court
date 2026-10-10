import { describe, it, expect } from 'vitest'
import { DIFFICULTY, RepJudge, summarise, type JudgeInput, type RepResult } from '../judge'

interface RepSpec {
  /** Elbow at the bottom (deg). */
  bottom?: number
  /** Elbow reached at the top after this rep (deg). */
  top?: number
  /** Lowest shoulder height (arm lengths). */
  depth?: number
  /** Body angle through the rep. */
  hip?: number
  /** Seconds per rep. */
  repS?: number
}

/** Frames for a run of reps, as [t, input] pairs, starting and ending at the top. */
function frames(reps: RepSpec[], fps = 30, noise = 0, seed = 1): [number, JudgeInput | null][] {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2
  const out: [number, JudgeInput | null][] = []
  let t = 0
  const dt = 1000 / fps
  const push = (elbow: number, depth: number, hip: number) => {
    out.push([t, { elbow: elbow + rand() * noise, depth: depth + rand() * noise * 0.005, hip: hip + rand() * noise }])
    t += dt
  }
  let prevTop = 168
  let topDepth = 1
  for (let i = 0; i < 10; i++) push(prevTop, 1, 175) // settle at the top
  for (const r of reps) {
    const bottom = r.bottom ?? 70, top = r.top ?? 168, depth = r.depth ?? 0.2, hip = r.hip ?? 175, repS = r.repS ?? 1
    const n = Math.max(4, Math.round((repS * 1000) / dt))
    for (let k = 1; k <= n; k++) {
      const ph = k / n // 0..1 through the rep
      const down = ph < 0.5
      const u = down ? ph * 2 : (ph - 0.5) * 2 // 0..1 within half
      const from = down ? prevTop : bottom, to = down ? bottom : top
      const e = from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * u))
      // Shoulder height follows the elbow: it only gets back to full height if the elbows straighten.
      const dTop = (eTop: number) => depth + (1 - depth) * Math.min(1, (eTop - bottom) / (168 - bottom))
      const dFrom = down ? dTop(prevTop) : depth, dTo = down ? depth : dTop(top)
      push(e, dFrom + (dTo - dFrom) * (0.5 - 0.5 * Math.cos(Math.PI * u)), hip)
    }
    prevTop = top
    topDepth = depth + (1 - depth) * Math.min(1, (top - bottom) / (168 - bottom))
  }
  for (let i = 0; i < 25; i++) push(prevTop, topDepth, 175) // hold at the end
  return out
}

function judge(fr: [number, JudgeInput | null][], level: keyof typeof DIFFICULTY = 'normal') {
  const j = new RepJudge(DIFFICULTY[level])
  const results: RepResult[] = []
  for (const [t, a] of fr) {
    const r = j.push(t, a)
    if (r) results.push(r)
  }
  const last = j.finish()
  if (last) results.push(last)
  return results
}

describe('RepJudge: lights', () => {
  it('a clean rep gets three white lights and counts as perfect', () => {
    const [r] = judge(frames([{}]))
    expect(r.lights).toEqual({ depth: true, torso: true, lockout: true })
    expect(r.counted && r.perfect).toBe(true)
    expect(r.faults).toEqual([])
  })

  it('a shallow rep fails depth only: 2 lights, counts, not perfect', () => {
    const [r] = judge(frames([{ bottom: 110, depth: 0.72 }]))
    expect(r.lights).toEqual({ depth: false, torso: true, lockout: true })
    expect(r.counted).toBe(true)
    expect(r.perfect).toBe(false)
    expect(r.faults[0]).toMatch(/Not deep enough/)
  })

  it('sagging hips fail torso', () => {
    const [r] = judge(frames([{ hip: 140 }]))
    expect(r.lights.torso).toBe(false)
    expect(r.faults.join()).toMatch(/Body not straight/)
  })

  it('no lockout: a rep that comes up to 135° and goes down again fails lockout; the next rep is still found', () => {
    const rs = judge(frames([{ top: 135 }, {}]))
    expect(rs).toHaveLength(2)
    expect(rs[0].lights.lockout).toBe(false)
    expect(rs[0].measured.lockout).toBeLessThan(140)
    expect(rs[1].lights.lockout).toBe(true)
  })

  it('no lockout on the last rep: ended by the stall timer', () => {
    const rs = judge(frames([{}, { top: 135 }]))
    expect(rs).toHaveLength(2)
    expect(rs[1].lights.lockout).toBe(false)
  })

  it('shallow + sagging = 1 light, does not count', () => {
    const [r] = judge(frames([{ bottom: 115, depth: 0.72, hip: 140 }]))
    expect(r.whiteCount).toBe(1)
    expect(r.counted).toBe(false)
  })

  it('all three faults = 0 lights', () => {
    const rs = judge(frames([{ bottom: 110, depth: 0.72, hip: 140, top: 150 }, {}]))
    expect(rs[0].whiteCount, JSON.stringify(rs[0])).toBe(0)
  })

  it('a bounce of less than 20° at the bottom is part of the same rep', () => {
    const rs = judge(frames([{ bottom: 115, depth: 0.72, top: 130 }, {}]))
    expect(rs).toHaveLength(1)
  })
})

describe('RepJudge: segmentation', () => {
  it('counts 10 reps at a normal pace', () => {
    expect(judge(frames(Array(10).fill({})))).toHaveLength(10)
  })

  it('counts 10 flat-out reps (0.5 s each) at 30 fps', () => {
    const rs = judge(frames(Array(10).fill({ repS: 0.5 })))
    expect(rs).toHaveLength(10)
    expect(rs.every((r) => r.perfect)).toBe(true)
  })

  it('counts 10 flat-out reps at 15 fps', () => {
    expect(judge(frames(Array(10).fill({ repS: 0.5 }), 15))).toHaveLength(10)
  })

  it('jitter of ±3° does not create extra reps or fail clean ones', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rs = judge(frames(Array(10).fill({}), 30, 3, seed))
      expect(rs, `seed ${seed}`).toHaveLength(10)
      expect(rs.filter((r) => r.perfect).length, `seed ${seed}`).toBeGreaterThanOrEqual(9)
    }
  })

  it('a small wobble at the top is not a rep', () => {
    const fr: [number, JudgeInput][] = []
    for (let i = 0; i < 60; i++) fr.push([i * 33, { elbow: 165 + 8 * Math.sin(i / 3), depth: 1, hip: 175 }])
    expect(judge(fr)).toHaveLength(0)
  })

  it('one bad hip frame does not fail torso (robust 10th percentile)', () => {
    const fr = frames([{ repS: 1.5 }])
    const mid = fr.findIndex(([, a]) => a!.elbow < 100)
    fr[mid][1] = { ...fr[mid][1]!, hip: 120 }
    expect(judge(fr)[0].lights.torso).toBe(true)
  })

  it('missing frames (null) are skipped', () => {
    const fr = frames(Array(5).fill({})).map(([t, a], i) => [t, i % 4 === 2 ? null : a] as [number, JudgeInput | null])
    expect(judge(fr)).toHaveLength(5)
  })

  it('losing the player for > 1.5 s mid-rep discards that rep', () => {
    const fr = frames([{ repS: 1 }])
    const bottom = fr.findIndex(([, a]) => a!.elbow < 75)
    const after = fr.slice(bottom + 1).map(([t, a]) => [t + 2000, a] as [number, JudgeInput | null])
    expect(judge([...fr.slice(0, bottom + 1), ...after])).toHaveLength(0)
  })

  it('stopping mid-descent or less than halfway up scores nothing; stopping most of the way up scores it', () => {
    const fr = frames([{ repS: 2 }])
    const j = new RepJudge(DIFFICULTY.normal)
    const bottom = fr.findIndex(([, a]) => a!.elbow < 75)
    for (const [t, a] of fr.slice(0, bottom - 3)) j.push(t, a)
    expect(j.finish()).toBeNull()
    const j2 = new RepJudge(DIFFICULTY.normal)
    const halfway = fr.findIndex(([, a], i) => i > bottom && a!.elbow > 110)
    for (const [t, a] of fr.slice(0, halfway)) j2.push(t, a)
    expect(j2.finish()).toBeNull()
    const j3 = new RepJudge(DIFFICULTY.normal)
    const nearTop = fr.findIndex(([, a], i) => i > bottom && a!.elbow > 150)
    for (const [t, a] of fr.slice(0, nearTop)) j3.push(t, a)
    expect(j3.finish()?.lights.lockout).toBe(false)
  })
})

describe('difficulty', () => {
  it('a borderline rep passes on easy and fails on hard', () => {
    // Depth 0.68 and a 158° body: inside Easy (0.70, 145°), outside Hard (0.60, 165°). Shoulders get back up: lockout.
    const fr = frames([{ bottom: 95, depth: 0.68, hip: 158 }, {}])
    expect(judge(fr, 'easy')[0].whiteCount).toBe(3)
    expect(judge(fr, 'hard')[0].whiteCount).toBe(1)
  })

  it('thresholds get stricter from easy to hard', () => {
    expect(DIFFICULTY.easy.lockoutElbow).toBeLessThan(DIFFICULTY.normal.lockoutElbow)
    expect(DIFFICULTY.normal.lockoutElbow).toBeLessThan(DIFFICULTY.hard.lockoutElbow)
    expect(DIFFICULTY.easy.torsoHip).toBeLessThan(DIFFICULTY.hard.torsoHip)
    expect(DIFFICULTY.easy.depth).toBeGreaterThan(DIFFICULTY.hard.depth)
  })
})

describe('summarise', () => {
  it('counts attempts, good, perfect and accuracy', () => {
    const rs = judge(frames([{}, {}, { bottom: 110, depth: 0.72 }, { bottom: 115, depth: 0.72, hip: 140 }]))
    const s = summarise(rs)
    expect(s.attempted).toBe(4)
    expect(s.counted).toBe(3)
    expect(s.perfect).toBe(2)
    expect(s.failed).toBe(1)
    expect(s.accuracy).toBeCloseTo(0.75)
    expect(s.lightRates.depth).toBeCloseTo(0.5)
  })

  it('no attempts gives null accuracy', () => {
    expect(summarise([]).accuracy).toBeNull()
  })
})

describe('wrists hidden (no depth): the shoulder must really move', () => {
  const run = (fr: [number, JudgeInput][]) => {
    const j = new RepJudge(DIFFICULTY.normal)
    const out: RepResult[] = []
    for (const [t, a] of fr) { const r = j.push(t, a); if (r) out.push(r) }
    const last = j.finish()
    if (last) out.push(last)
    return out
  }

  it('an elbow glitch to 40° for 4 frames, shoulder still, is not a rep', () => {
    const fr: [number, JudgeInput][] = []
    for (let i = 0; i < 90; i++) {
      const glitch = i >= 30 && i < 34
      fr.push([i * 33.3, { elbow: glitch ? 40 : 168, hip: 175, depth: NaN, shoulderY: 0.45 }])
    }
    expect(run(fr)).toHaveLength(0)
  })

  it('a real rep with the shoulder dropping counts, judged on the elbow fallback', () => {
    const fr: [number, JudgeInput][] = []
    for (let i = 0; i < 90; i++) {
      const ph = i < 20 || i > 50 ? 0 : (i - 20) / 30
      const e = 168 - 98 * Math.sin(Math.PI * ph)
      fr.push([i * 33.3, { elbow: e, hip: 175, depth: NaN, shoulderY: 0.45 + 0.12 * Math.sin(Math.PI * ph) }])
    }
    const rs = run(fr)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })
})

describe('a push-up is down AND back up', () => {
  const run = (fr: [number, JudgeInput | null][]) => {
    const j = new RepJudge(DIFFICULTY.hard)
    const out: RepResult[] = []
    for (const [t, a] of fr) { const r = j.push(t, a); if (r) out.push(r) }
    const last = j.finish()
    if (last) out.push(last)
    return out
  }

  it('collapsing flat to the floor at failure is not a rep, even when the arms splay out on the floor', () => {
    // Two good reps, then the third goes down and the player falls flat: shoulders stay on the floor,
    // the elbows straighten as the arms slide out, and the body stays straight.
    const fr = frames([{}, {}])
    let t = fr.at(-1)![0]
    for (let k = 0; k <= 20; k++) fr.push([(t += 33), { elbow: 168 - 5 * k, hip: 176, depth: 1 - 0.045 * k }])
    for (let k = 0; k <= 60; k++) fr.push([(t += 33), { elbow: Math.min(160, 70 + 3 * k), hip: 178, depth: 0.05 }]) // flat on the floor
    const rs = run(fr)
    expect(rs).toHaveLength(2)
    expect(rs.every((r) => r.perfect)).toBe(true)
  })

  it('a slow grind back up (5 s) still counts once it locks out', () => {
    const fr: [number, JudgeInput][] = []
    let t = 0
    for (let k = 0; k < 15; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 1 }])
    for (let k = 0; k <= 15; k++) fr.push([(t += 33), { elbow: 168 - 6.5 * k, hip: 176, depth: 1 - 0.053 * k }])
    for (let k = 0; k <= 150; k++) fr.push([(t += 33), { elbow: 70 + (98 * k) / 150, hip: 176, depth: 0.2 + (0.8 * k) / 150 }])
    for (let k = 0; k < 15; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 1 }])
    const rs = run(fr)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })
})

describe('flared elbows: reps follow the shoulders, not the elbow', () => {
  // Side-on, flared elbows point at or away from the camera, so the elbow barely seems to bend.
  const flared = (reps: number, elbowAt = (u: number) => 168 - 12 * u) => {
    const fr: [number, JudgeInput][] = []
    let t = 0
    for (let k = 0; k < 20; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 0.95, shoulderY: 0.46 }])
    for (let r = 0; r < reps; r++) {
      for (let k = 0; k <= 36; k++) {
        const u = Math.sin((Math.PI * k) / 36) // 0 → 1 → 0
        fr.push([(t += 33), { elbow: elbowAt(u), hip: 176, depth: 0.95 - 0.45 * u, shoulderY: 0.46 + 0.15 * u }])
      }
      for (let k = 0; k < 8; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 0.95, shoulderY: 0.46 }])
    }
    return fr
  }
  const run = (fr: [number, JudgeInput][]) => {
    const j = new RepJudge(DIFFICULTY.hard)
    const out: RepResult[] = []
    for (const [t, a] of fr) { const r = j.push(t, a); if (r) out.push(r) }
    return out
  }

  it('the elbow reads only 12° of bend, but the shoulders go down and up: every rep counts', () => {
    const rs = run(flared(5))
    expect(rs).toHaveLength(5)
    expect(rs.every((r) => r.lights.depth && r.lights.lockout)).toBe(true)
  })

  it('the elbow reading jumps around (flaring in and out) but the shoulders move cleanly: still counted', () => {
    const rs = run(flared(5, (u) => 150 + 18 * Math.sin(u * 9)))
    expect(rs).toHaveLength(5)
  })

  it('a conventional push-up bottom (shoulders 0.6 arm lengths over the hands) passes depth on Hard', () => {
    const fr: [number, JudgeInput][] = []
    let t = 0
    for (let k = 0; k < 20; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 0.95 }])
    for (let k = 0; k <= 36; k++) {
      const u = Math.sin((Math.PI * k) / 36)
      fr.push([(t += 33), { elbow: 168 - 75 * u, hip: 176, depth: 0.95 - 0.36 * u }])
    }
    for (let k = 0; k < 10; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 0.95 }])
    const [r] = run(fr)
    expect(r.lights.depth).toBe(true)
  })
})

describe('lockout: judged the moment the player is back at the top', () => {
  /** Reps whose straight arms only read `peak`° (common side-on), shoulders going fully back up. */
  const reps = (n: number, peak: number, repMs: number, pauseMs = 0) => {
    const fr: [number, JudgeInput][] = []
    const tops: number[] = []
    let t = 0
    for (let k = 0; k < 20; k++) fr.push([(t += 33), { elbow: peak, hip: 176, depth: 0.97 }])
    const steps = Math.round(repMs / 33)
    for (let r = 0; r < n; r++) {
      for (let k = 1; k <= steps; k++) {
        const u = Math.sin((Math.PI * k) / steps) // 0 → 1 → 0
        fr.push([(t += 33), { elbow: peak - (peak - 75) * u, hip: 176, depth: 0.97 - 0.5 * u }])
      }
      tops.push(t) // back at the top
      for (let k = 0; k < Math.round(pauseMs / 33); k++) fr.push([(t += 33), { elbow: peak, hip: 176, depth: 0.97 }])
    }
    return { fr, tops }
  }
  const run = (fr: [number, JudgeInput][]) => {
    const j = new RepJudge(DIFFICULTY.hard)
    const out: RepResult[] = []
    for (const [t, a] of fr) { const r = j.push(t, a); if (r) out.push(r) }
    return out
  }

  it('straight arms that only read 158° still get the lockout light on Hard when the shoulders are back up', () => {
    const rs = run(reps(5, 158, 1200, 400).fr)
    expect(rs).toHaveLength(5)
    expect(rs.every((r) => r.lights.lockout)).toBe(true)
  })

  it('each rep is judged as soon as the shoulders are back at the top, not when the next rep starts', () => {
    const { fr, tops } = reps(10, 158, 600) // fast, touch-and-go
    let t = fr.at(-1)![0]
    for (let k = 0; k < 5; k++) fr.push([(t += 33), { elbow: 158, hip: 176, depth: 0.97 }])
    const rs = run(fr)
    expect(rs).toHaveLength(10)
    // Within a frame or two of reaching the top (the 3-frame smoothing lags one frame).
    rs.forEach((r, i) => expect(r.endT, `rep ${i + 1}`).toBeLessThanOrEqual(tops[i] + 70))
  })

  it('coming back only to 145° (shoulders short of the top) is still no lockout', () => {
    const fr: [number, JudgeInput][] = []
    let t = 0
    for (let k = 0; k < 20; k++) fr.push([(t += 33), { elbow: 168, hip: 176, depth: 0.98 }])
    for (let k = 1; k <= 36; k++) {
      const down = k <= 18, u = down ? k / 18 : (36 - k) / 18
      // back up only to 145° and 0.9 height
      fr.push([(t += 33), down ? { elbow: 168 - 93 * u, hip: 176, depth: 0.98 - 0.5 * u } : { elbow: 145 - 70 * u, hip: 176, depth: 0.9 - 0.42 * u }])
    }
    for (let k = 0; k < 60; k++) fr.push([(t += 33), { elbow: 145, hip: 176, depth: 0.9 }])
    const rs = run(fr)
    expect(rs).toHaveLength(1)
    expect(rs[0].lights.lockout).toBe(false)
  })
})
