// Adversarial tests for the push-up referee (judge.ts).
//
// Tests named 'KNOWN:' document behaviour that a human judge would disagree
// with. They assert what the implementation does TODAY so the suite stays
// green; flip them when the judge is fixed. Untagged tests are regressions
// for bugs that were fixed (or behaviour that was always right).
import { describe, it, expect } from 'vitest'
import { DIFFICULTY, RepJudge, summarise, type Difficulty, type JudgeInput, type RepResult } from '../judge'
import { judgeLog, type FrameRecord } from '../repLog'

type Frame = [number, JudgeInput | null]

// ---------- signal builder ----------

/** Shoulder height (arm lengths) implied by an elbow angle: 70° -> 0.2, 168° -> 1. Pessimistic at mid angles. */
const depthLinear = (elbow: number) => Math.min(1.05, Math.max(0.1, 0.2 + ((elbow - 70) / 98) * 0.8))
/**
 * More realistic: forearm vertical, upper arm and forearm equal length, so the
 * shoulder is f - u·cos(elbow) above the wrist = 0.5 - 0.5·cos(elbow).
 * 168° -> 0.99, 130° -> 0.82, 90° -> 0.5, 70° -> 0.33.
 */
const depthForearm = (elbow: number) => 0.5 - 0.5 * Math.cos((elbow * Math.PI) / 180)

interface Opts { fps?: number; hip?: number; t0?: number; depth?: 'linear' | 'forearm' }

/**
 * Builds frames from keyframes: [ms to get there, elbow target]. A duration of
 * 0 with the same angle is a no-op; use hold(ms) for a hold. Eases with a
 * half-cosine between keys. Depth follows the elbow, hip is constant.
 */
class Track {
  frames: Frame[] = []
  t: number
  elbow: number
  readonly dt: number
  hip: number
  readonly depthOf: (elbow: number) => number
  constructor(start = 168, o: Opts = {}) {
    this.depthOf = o.depth === 'forearm' ? depthForearm : depthLinear
    this.dt = 1000 / (o.fps ?? 30)
    this.t = o.t0 ?? 0
    this.elbow = start
    this.hip = o.hip ?? 175
  }
  private emit(elbow: number) {
    this.frames.push([this.t, { elbow, hip: this.hip, depth: this.depthOf(elbow) }])
    this.t += this.dt
  }
  to(ms: number, target: number) {
    const n = Math.max(1, Math.round(ms / this.dt))
    const from = this.elbow
    for (let k = 1; k <= n; k++) this.emit(from + (target - from) * (0.5 - 0.5 * Math.cos((Math.PI * k) / n)))
    this.elbow = target
    return this
  }
  /** Constant-speed move (no easing). */
  lin(ms: number, target: number) {
    const n = Math.max(1, Math.round(ms / this.dt))
    const from = this.elbow
    for (let k = 1; k <= n; k++) this.emit(from + ((target - from) * k) / n)
    this.elbow = target
    return this
  }
  /** One frame with a raw elbow value (a glitch); the track's own position is unchanged. */
  glitch(elbow: number, frames = 1) {
    for (let k = 0; k < frames; k++) {
      this.frames.push([this.t, { elbow, hip: this.hip, depth: this.depthOf(this.elbow) }])
      this.t += this.dt
    }
    return this
  }
  hold(ms: number) {
    const n = Math.max(1, Math.round(ms / this.dt))
    for (let k = 0; k < n; k++) this.emit(this.elbow)
    return this
  }
  /** One clean rep: down to `bottom`, up to `top`, `ms` total. */
  rep(ms = 1000, bottom = 70, top = 168) {
    return this.to(ms / 2, bottom).to(ms / 2, top)
  }
  gap(ms: number) {
    const n = Math.max(1, Math.round(ms / this.dt))
    for (let k = 0; k < n; k++) { this.frames.push([this.t, null]); this.t += this.dt }
    return this
  }
}

function run(fr: Frame[], level: Difficulty = 'normal') {
  const j = new RepJudge(DIFFICULTY[level])
  const out: RepResult[] = []
  for (const [t, a] of fr) {
    const r = j.push(t, a)
    if (r) out.push(r)
  }
  const last = j.finish()
  if (last) out.push(last)
  return out
}

// Seeded gaussian noise (Park-Miller + Box-Muller).
function gauss(seed: number) {
  let s = seed % 2147483647 || 1
  const u = () => (s = (s * 16807) % 2147483647) / 2147483647
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())
}
function noisy(fr: Frame[], seed: number, sdAngle: number, sdDepth: number): Frame[] {
  const g = gauss(seed)
  return fr.map(([t, a]) => [t, a && { elbow: a.elbow + g() * sdAngle, hip: a.hip + g() * sdAngle, depth: a.depth + g() * sdDepth }])
}

const lightsOf = (r: RepResult) => `${+r.lights.depth}${+r.lights.torso}${+r.lights.lockout}`

// ---------- holds and pace ----------

describe('holds and pace', () => {
  it('holding the bottom for 5 s, then up, is one perfect rep', () => {
    const rs = run(new Track().hold(500).to(500, 70).hold(5000).to(500, 168).hold(1000).frames)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })

  it('holding the top for 10 s between reps gives no phantom reps', () => {
    const rs = run(new Track().hold(500).rep().hold(10000).rep().hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111', '111'])
  })

  it('very slow reps (4 s each) are counted and perfect', () => {
    const tr = new Track().hold(500)
    for (let i = 0; i < 5; i++) tr.rep(4000)
    const rs = run(tr.hold(1000).frames)
    expect(rs).toHaveLength(5)
    expect(rs.every((r) => r.perfect)).toBe(true)
  })

  it.each([30, 15])('very fast reps (0.35 s) at %i fps are all counted', (fps) => {
    const tr = new Track(168, { fps }).hold(500)
    for (let i = 0; i < 10; i++) tr.rep(350)
    const rs = run(tr.hold(1000).frames)
    expect(rs).toHaveLength(10)
    expect(rs.every((r) => r.counted)).toBe(true)
  })

  it('very fast reps at hard difficulty, 15 fps: lockout still seen', () => {
    const tr = new Track(170, { fps: 15 }).hold(500)
    for (let i = 0; i < 10; i++) tr.rep(350, 70, 170)
    const rs = run(tr.hold(1000).frames, 'hard')
    expect(rs).toHaveLength(10)
    expect(rs.every((r) => r.lights.lockout)).toBe(true)
  })
})

// ---------- partial reps ----------

describe('partial reps / bouncing', () => {
  it('rapid half reps (165 <-> 125, shoulders drop ~20%) are each a no-rep: Depth red, buzzer', () => {
    const tr = new Track(165, { depth: 'forearm' }).hold(500)
    for (let i = 0; i < 8; i++) tr.to(250, 125).to(250, 165)
    const rs = run(tr.hold(1000).frames)
    expect(rs).toHaveLength(8)
    expect(rs.every((r) => lightsOf(r) === '011' && !r.counted)).toBe(true)
  })

  it('the same 165 <-> 130 bounce with the pessimistic linear depth model: 8 no-reps, none counted', () => {
    const tr = new Track(165).hold(500)
    for (let i = 0; i < 8; i++) tr.to(250, 130).to(250, 165)
    const rs = run(tr.hold(1000).frames)
    expect(rs).toHaveLength(8)
    expect(rs.every((r) => lightsOf(r) === '011' && !r.counted)).toBe(true)
  })

  it('a 50° half rep (165 <-> 115) is a no-rep with only the depth light red (depth is required)', () => {
    const tr = new Track(165, { depth: 'forearm' }).hold(500)
    for (let i = 0; i < 4; i++) tr.to(300, 115).to(300, 165)
    const rs = run(tr.hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['011', '011', '011', '011'])
    expect(rs.some((r) => r.counted)).toBe(false)
  })

  it('a 25° bend (168 -> 143 -> 168, shoulders drop ~20%) is a no-rep on normal', () => {
    const rs = run(new Track().hold(500).to(400, 143).to(400, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['011'])
    expect(rs[0].counted).toBe(false)
  })

  it('a 25° bend at full lockout is a no-rep on hard', () => {
    const rs = run(new Track(175).hold(500).to(400, 150).to(400, 175).hold(1000).frames, 'hard')
    expect(rs.every((r) => !r.counted)).toBe(true)
  })

  it('a small bend (168 -> 150, shoulders drop ~13%) is not an attempt: no lights', () => {
    expect(run(new Track().hold(500).to(400, 150).to(400, 168).hold(1000).frames)).toHaveLength(0)
  })

  it('a bounce at the bottom that only comes ~45% back up, then goes down again, is a no-rep (did not come back up)', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 115).to(400, 70).to(500, 168).hold(1000).frames)
    expect(rs.length).toBeGreaterThanOrEqual(1)
    expect(rs[0].counted).toBe(false)
    expect(rs[0].lights.lockout).toBe(false)
    expect(rs[0].faults.join(' ')).toMatch(/come back up/)
  })

  it('a dip of under 20° is not a rep', () => {
    expect(run(new Track().hold(500).to(400, 150).to(400, 168).hold(1000).frames)).toHaveLength(0)
  })
})

// ---------- sticking point ----------

describe('sticking point on the way up', () => {
  it('168 -> 70 -> 120 -> 110 -> 165: one rep, lockout white', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 120).to(200, 110).to(400, 165).hold(1000).frames)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })

  it('a 16° sag at the sticking point (120 -> 104) is still ONE perfect rep', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 120).to(200, 104).to(400, 165).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('a 20° sag at the sticking point (120 -> 100) is still ONE perfect rep', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 120).to(250, 100).to(400, 165).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('a 28° sag at the sticking point (120 -> 92) is ONE perfect rep (turning phase: dip, same rep)', () => {
    const rs = run(new Track(168, { depth: 'forearm' }).hold(500).to(500, 70).to(300, 120).to(250, 92).to(400, 165).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('a 30° sag at the sticking point (120 -> 90) is still ONE perfect rep', () => {
    const rs = run(new Track(168, { depth: 'forearm' }).hold(500).to(500, 70).to(300, 120).to(300, 90).to(400, 165).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('a 44° sag from halfway up (120 -> 76) drops the shoulders like a new rep: two reps, the first without lockout', () => {
    // Since reps follow shoulder height, a drop this big counts as a new descent. The first movement came
    // 64% of the way back up (shoulders), so it is scored, without lockout.
    const rs = run(new Track(168, { depth: 'forearm' }).hold(500).to(500, 70).to(300, 120).to(300, 76).to(400, 165).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['110', '111'])
  })

  it('oscillating 6 times at the sticking point (125 <-> 98) then locking out is ONE rep', () => {
    const t = new Track().hold(500).to(500, 70)
    for (let i = 0; i < 6; i++) t.to(300, 125).to(300, 98)
    expect(run(t.to(500, 168).hold(1000).frames).map(lightsOf)).toEqual(['111'])
  })

  it('pausing 0.8 s at the sticking point then locking out is a perfect rep', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 120).hold(800).to(500, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('pausing 2 s at the sticking point, halfway up, then locking out is one good rep (a grind is not cut off)', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 120).hold(2000).to(500, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('stalling 2 s near the top (most of the way up) ends the rep without lockout', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(400, 150).hold(2000).to(500, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['110'])
  })

  it('a slow grind (always rising) is not cut by the stall timer', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(3000, 168).hold(1000).frames)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })
})

// ---------- noise ----------

function cleanSet(fps = 30) {
  const tr = new Track(168, { fps }).hold(1000)
  for (let i = 0; i < 10; i++) tr.rep(1200).hold(300)
  return tr.hold(1000).frames
}

function noiseStats(sdAngle: number, sdDepth: number, seeds = 50) {
  let wrongCount = 0, extra = 0, missing = 0, redLights = 0, total = 0
  for (let seed = 1; seed <= seeds; seed++) {
    const rs = run(noisy(cleanSet(), seed, sdAngle, sdDepth))
    if (rs.length !== 10) wrongCount++
    extra += Math.max(0, rs.length - 10)
    missing += Math.max(0, 10 - rs.length)
    for (const r of rs) { total += 3; redLights += 3 - r.whiteCount }
  }
  return { wrongCount, extra, missing, redLights, total }
}

describe('noise', () => {
  it('gaussian σ=2°, σ=0.01 depth: rep count exact on every seed', () => {
    const s = noiseStats(2, 0.01)
    expect(s.wrongCount).toBe(0)
  })

  it('gaussian σ=5° / σ=0.03 at 30 fps: exact rep count and no false red lights on all 50 seeds', () => {
    // Before the median/recent-top rework: 27/50 seeds wrong, 41 extra reps.
    expect(noiseStats(5, 0.03)).toEqual({ wrongCount: 0, extra: 0, missing: 0, redLights: 0, total: 1500 })
  })

  it('gaussian σ=5° / σ=0.03 at 15 fps (no median): exact rep count on all 50 seeds', () => {
    let wrong = 0
    for (let seed = 1; seed <= 50; seed++) if (run(noisy(cleanSet(15), seed, 5, 0.03)).length !== 10) wrong++
    expect(wrong).toBe(0)
  })

  it('σ=5° while holding at the top for 10 s: no phantom reps (50 seeds)', () => {
    let phantoms = 0
    for (let seed = 1; seed <= 50; seed++) phantoms += run(noisy(new Track().hold(10000).frames, seed, 5, 0.03)).length
    expect(phantoms).toBe(0)
  })

  it('σ=5° while holding at the bottom for 5 s: exactly one rep (50 seeds)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rs = run(noisy(new Track().hold(500).to(500, 70).hold(5000).to(500, 168).hold(1000).frames, seed, 5, 0.03))
      expect(rs, `seed ${seed}`).toHaveLength(1)
    }
  })

  it('a 1- or 2-frame elbow glitch to 40° at the top (30 fps) is ignored', () => {
    for (const n of [1, 2]) expect(run(new Track().hold(1000).glitch(40, n).hold(1000).frames), `${n} frames`).toHaveLength(0)
  })

  it('3-8 frame elbow glitches to 40° at the top (30 fps) are ignored: the shoulders did not drop (minDepthDrop)', () => {
    for (const n of [3, 5, 8]) expect(run(new Track().hold(1000).glitch(40, n).hold(1000).frames), `${n} frames`).toHaveLength(0)
  })

  it('at 15 fps (median off) 1-3 frame elbow glitches to 40° at the top are ignored', () => {
    for (const n of [1, 2, 3]) expect(run(new Track(168, { fps: 15 }).hold(1000).glitch(40, n).hold(1000).frames), `${n} frames`).toHaveLength(0)
  })

  const noDepthFr = (fr: Frame[]) => fr.map(([t, a]) => [t, a && { ...a, depth: NaN }] as Frame)

  it('KNOWN: with depth missing (wrists hidden), a 3+-frame elbow glitch at 30 fps is a PERFECT phantom rep', () => {
    // No depth -> minDepthDrop is skipped, and the depth fallback (elbow <= 85°) is satisfied by the 40° glitch.
    expect(run(noDepthFr(new Track().hold(1000).glitch(40, 1).hold(1000).frames))).toHaveLength(0)
    for (const n of [3, 5]) expect(run(noDepthFr(new Track().hold(1000).glitch(40, n).hold(1000).frames)).map(lightsOf), `${n} frames`).toEqual(['111'])
  })

  it('KNOWN: with depth missing at 15 fps, a SINGLE-frame elbow glitch is a PERFECT phantom rep', () => {
    expect(run(noDepthFr(new Track(168, { fps: 15 }).hold(1000).glitch(40).hold(1000).frames)).map(lightsOf)).toEqual(['111'])
  })

  it('KNOWN: a one-frame whole-skeleton glitch at 15 fps (elbow 40°, depth 0.2) is a PERFECT phantom rep', () => {
    const t = new Track(168, { fps: 15 }).hold(1000)
    t.frames.push([t.t, { elbow: 40, hip: 175, depth: 0.2 }]); t.t += t.dt
    expect(run(t.hold(1000).frames).map(lightsOf)).toEqual(['111'])
  })

  it('a single-frame elbow spike to 40° mid-descent does not add a rep', () => {
    const fr = new Track().hold(500).rep(1200).hold(1000).frames
    const i = fr.findIndex(([, a]) => a!.elbow < 120)
    fr[i][1] = { ...fr[i][1]!, elbow: 40 }
    expect(run(fr).map(lightsOf)).toEqual(['111'])
  })

  it('a single-frame upward spike (+35°) on the way up does not end the rep early', () => {
    const fr = new Track().hold(500).rep(1200).hold(1000).frames
    const bottom = fr.findIndex(([, a]) => a!.elbow <= 70.01)
    const i = fr.findIndex(([, a], k) => k > bottom && a!.elbow > 125)
    fr[i][1] = { ...fr[i][1]!, elbow: fr[i][1]!.elbow + 35 }
    expect(run(fr).map(lightsOf)).toEqual(['111'])
  })

  it('a single-frame hip drop to 100° does not fail torso on a normal-speed rep', () => {
    const fr = new Track().hold(500).rep(1200).hold(1000).frames
    const i = fr.findIndex(([, a]) => a!.elbow < 80)
    fr[i][1] = { ...fr[i][1]!, hip: 100 }
    expect(run(fr)[0].lights.torso).toBe(true)
  })

  it('on a fast rep (< 10 frames) one bad hip frame does not fail torso', () => {
    const fr = new Track(168, { fps: 15 }).hold(500).rep(450).hold(1000).frames
    const i = fr.findIndex(([, a]) => a!.elbow < 90)
    fr[i][1] = { ...fr[i][1]!, hip: 100 }
    expect(run(fr).map(lightsOf)).toEqual(['111'])
  })

  it('two bad hip frames on a fast rep still fail torso (real sag is not hidden)', () => {
    const fr = new Track(168, { fps: 15 }).hold(500).rep(450).hold(1000).frames
    const i = fr.findIndex(([, a]) => a!.elbow < 90)
    fr[i][1] = { ...fr[i][1]!, hip: 100 }
    fr[i + 1][1] = { ...fr[i + 1][1]!, hip: 100 }
    expect(run(fr)[0].lights.torso).toBe(false)
  })
})

// ---------- tracking dropouts ----------

describe('tracking dropouts', () => {
  it('300 ms of null frames at the bottom: still one perfect rep', () => {
    const rs = run(new Track().hold(500).to(500, 70).gap(300).hold(100).to(500, 168).hold(1000).frames)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })

  it('2 s of null frames at the top between reps: both reps counted', () => {
    const rs = run(new Track().hold(500).rep().gap(2000).hold(300).rep().hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111', '111'])
  })

  it('2 s dropout mid-rep discards it; the next rep still works', () => {
    const rs = run(new Track().hold(500).to(500, 70).gap(2000).hold(100).to(500, 168).hold(500).rep().hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('2 s dropout mid-descent, tracking resumes on the way up: no rep, next rep fine', () => {
    const rs = run(new Track().hold(500).to(300, 120).gap(2000).to(300, 140).to(300, 168).hold(500).rep().hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('a 1 s freeze on the way up (no new frames, < maxGap) then a slightly lower frame does not trip the stall', () => {
    const tr = new Track().hold(500).to(500, 70).to(300, 140)
    tr.t += 1000 // camera hiccup: no frames at all
    expect(run(tr.to(10, 139).to(300, 168).hold(1000).frames).map(lightsOf)).toEqual(['111'])
  })

  it('reappearing at the bottom after 2 s out of view at the top: the rep is scored', () => {
    const a = new Track().hold(1000)
    const c = new Track(70, { t0: a.t + 2000 }).hold(300).to(500, 168).hold(1000)
    expect(run([...a.frames, ...c.frames]).map(lightsOf)).toEqual(['111'])
  })
})

// ---------- side switch ----------

describe('tracked side flips mid-rep', () => {
  it('a +/-8° jump on the way down and up does not change the result', () => {
    const fr = new Track().hold(500).rep(1200).hold(1000).frames
    const shifted = fr.map(([t, a], i) => [t, a && i > 25 && i < 40 ? { ...a, elbow: a.elbow + 8, hip: a.hip - 4 } : a] as Frame)
    const rs = run(shifted)
    expect(rs).toHaveLength(1)
    expect(rs[0].perfect).toBe(true)
  })

  it('the far side reads 16° more bent for the rest of the rep, but the shoulders get back to the top: lockout counts', () => {
    const fr = new Track().hold(500).rep(1200).hold(1000).frames
    const bottom = fr.findIndex(([, a]) => a!.elbow <= 70.01)
    const rs = run(fr.map(([t, a], i) => [t, a && i > bottom + 4 ? { ...a, elbow: a.elbow - 16 } : a] as Frame))
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('a brief flip to the far side (-20° for 3 frames) during a 1.2 s rep is absorbed', () => {
    const fr = new Track().hold(500).rep(1200).hold(1000).frames
    const bottom = fr.findIndex(([, a]) => a!.elbow <= 70.01)
    for (const off of [4, 8, 12]) {
      expect(run(fr.map(([t, a], i) => [t, a && i > bottom + off && i <= bottom + off + 3 ? { ...a, elbow: a.elbow - 20 } : a] as Frame)).map(lightsOf)).toEqual(['111'])
    }
  })

  it('the same brief flip during a slow (3 s) rep is absorbed (was: split into two counted reps)', () => {
    const fr = new Track().hold(500).rep(3000).hold(1000).frames
    const bottom = fr.findIndex(([, a]) => a!.elbow <= 70.01)
    for (const off of [10, 20, 30, 40]) {
      expect(run(fr.map(([t, a], i) => [t, a && i > bottom + off && i <= bottom + off + 3 ? { ...a, elbow: a.elbow - 20 } : a] as Frame)).map(lightsOf), `offset ${off}`).toEqual(['111'])
    }
  })

  it('a brief flip reading -30° for 3 frames during a slow rep is absorbed too', () => {
    const fr = new Track().hold(500).rep(3000).hold(1000).frames
    const bottom = fr.findIndex(([, a]) => a!.elbow <= 70.01)
    for (const off of [10, 20, 30, 40]) {
      expect(run(fr.map(([t, a], i) => [t, a && i > bottom + off && i <= bottom + off + 3 ? { ...a, elbow: a.elbow - 30 } : a] as Frame)).length, `offset ${off}`).toBe(1)
    }
  })
})

// ---------- timestamps ----------

describe('timestamps', () => {
  it('duplicate timestamps are harmless', () => {
    const fr = new Track().hold(500).rep().hold(1000).frames
    const dup = fr.flatMap((f) => [f, [f[0], f[1]] as Frame])
    expect(run(dup).map(lightsOf)).toEqual(['111'])
  })

  it('one backwards timestamp mid-rep is harmless', () => {
    const fr = new Track().hold(500).rep().hold(1000).frames
    fr[25] = [fr[25][0] - 500, fr[25][1]]
    expect(run(fr).map(lightsOf)).toEqual(['111'])
  })

  it('KNOWN: a clock reset (timestamps jump back 1 h) freezes time: stall timer off and later reps vanish (< minRepMs)', () => {
    // Only reachable from replayed / external logs: the live app feeds monotonic performance.now().
    const tr = new Track(168, { t0: 3_600_000 }).hold(500).to(500, 70).to(300, 130)
    tr.t = 0
    tr.hold(3000) // stuck at 130, never locks out
    const j = new RepJudge(DIFFICULTY.normal)
    expect(tr.frames.map(([t, a]) => j.push(t, a)).filter(Boolean)).toHaveLength(0)
    expect(j.currentPhase).toBe('up')
    const tr2 = new Track(168, { t0: 3_600_000 }).hold(500)
    tr2.t = 0
    tr2.hold(500).rep().rep().hold(1000)
    expect(run(tr2.frames)).toHaveLength(0)
  })

  it('a 10 s gap at the top (no frames) then a rep: counted', () => {
    const tr = new Track().hold(500).rep()
    tr.t += 10000
    expect(run(tr.hold(300).rep().hold(1000).frames).map(lightsOf)).toEqual(['111', '111'])
  })
})

// ---------- API ----------

describe('API edge cases', () => {
  it('setThresholds mid-rep applies to the rep in progress', () => {
    // Body at 160°: straight enough for normal (155°), not for hard (165°).
    const fr = new Track(168, { hip: 160 }).hold(500).rep(1000, 70, 168).hold(1000).frames
    const j = new RepJudge(DIFFICULTY.normal)
    const out: RepResult[] = []
    fr.forEach(([t, a], i) => {
      if (i === 20) j.setThresholds(DIFFICULTY.hard)
      const r = j.push(t, a)
      if (r) out.push(r)
    })
    const last = j.finish()
    if (last) out.push(last)
    expect(out).toHaveLength(1)
    expect(out[0].lights.torso).toBe(false) // 160 < hard 165
  })

  it('finish() twice returns null the second time; push after finish works and rep numbers continue', () => {
    const j = new RepJudge(DIFFICULTY.normal)
    const fr = new Track().hold(500).to(500, 70).to(300, 145).frames
    fr.forEach(([t, a]) => j.push(t, a))
    const a = j.finish()
    expect(a?.rep).toBe(1)
    expect(j.finish()).toBeNull()
    const out = new Track(168, { t0: 10000 }).hold(500).rep().hold(500).frames.map(([t, f]) => j.push(t, f)).filter(Boolean)
    expect(out).toHaveLength(1)
    expect(out[0]!.rep).toBe(2)
  })

  it('finish() on a fresh judge is null', () => {
    expect(new RepJudge(DIFFICULTY.easy).finish()).toBeNull()
  })
})

// ---------- missing depth / hip ----------

describe('missing measurements', () => {
  const noDepth = (fr: Frame[]) => fr.map(([t, a]) => [t, a && { ...a, depth: NaN }] as Frame)

  it('depth NaN throughout -> depth judged from the elbow fallback; deep reps can be perfect, measured.depth is NaN', () => {
    const tr = new Track().hold(500)
    for (let i = 0; i < 3; i++) tr.rep()
    const rs = run(noDepth(tr.hold(1000).frames))
    expect(rs.map(lightsOf)).toEqual(['111', '111', '111'])
    expect(rs[0].measured.depth).toBeNaN()
    expect(rs[0].measured.bottomElbow).toBeLessThan(72) // median-of-3 lifts the 70° bottom by ~1°
    expect(summarise(rs).perfect).toBe(3)
  })

  it('depth NaN + a shallow rep (bottom 100°) -> depth red with a readable fault naming the elbow', () => {
    const [r] = run(noDepth(new Track().hold(500).rep(1000, 100).hold(1000).frames))
    expect(r.lights.depth).toBe(false)
    expect(r.faults[0]).toMatch(/elbows only bent to 10[01]°.*hands not visible/)
    expect(r.faults.join()).not.toMatch(/Infinity|NaN/)
  })

  it('depth-fallback thresholds per difficulty: bottom 92° passes easy/normal, fails hard', () => {
    const fr = noDepth(new Track().hold(500).rep(1000, 92, 170).hold(1000).frames)
    expect(run(fr, 'easy')[0].lights.depth).toBe(true)
    expect(run(fr, 'normal')[0].lights.depth).toBe(true)
    expect(run(fr, 'hard')[0].lights.depth).toBe(false)
  })

  it('depth NaN + a sag on a full-depth rep = 2 lights, counted', () => {
    const tr = new Track(168, { hip: 140 }).hold(500).rep()
    expect(run(noDepth(tr.hold(1000).frames)).map(lightsOf)).toEqual(['101'])
  })

  it('judgeLog on an old log without a depth field uses the elbow fallback', () => {
    const frames: FrameRecord[] = new Track().hold(500).rep().rep().hold(1000).frames.map(([t, a]) => ({
      t, elbow: a!.elbow, shoulderY: 0.4 + 0.15 * (1 - a!.depth), hipAngle: a!.hip, kneeAngle: 175, visibility: 0.9,
    }))
    expect(judgeLog(frames, new RepJudge(DIFFICULTY.normal)).map(lightsOf)).toEqual(['111', '111'])
  })

  it('hip NaN throughout -> torso red with a readable fault (no "NaN")', () => {
    const fr = new Track().hold(500).rep().hold(1000).frames.map(([t, a]) => [t, a && { ...a, hip: NaN }] as Frame)
    const [r] = run(fr)
    expect(r.lights.torso).toBe(false)
    expect(r.faults.join()).toContain('hips not visible')
    expect(r.faults.join()).not.toContain('NaN')
  })

  it('judgeLog drops frames with hipAngle null even if the elbow is fine', () => {
    const frames: FrameRecord[] = new Track().hold(500).rep().hold(1000).frames.map(([t, a], i) => ({
      t, elbow: a!.elbow, shoulderY: 0.5, hipAngle: i % 2 ? null : a!.hip, kneeAngle: 175, visibility: 0.9, depth: a!.depth,
    }))
    expect(judgeLog(frames, new RepJudge(DIFFICULTY.normal)).map(lightsOf)).toEqual(['111'])
  })
})

// ---------- variants ----------

describe('push-up variants', () => {
  it('KNOWN: knee push-ups (shoulder-hip-ankle ~130°) fail torso but still COUNT with depth + lockout', () => {
    const tr = new Track(168, { hip: 130 }).hold(500)
    for (let i = 0; i < 3; i++) tr.rep()
    const rs = run(tr.hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['101', '101', '101'])
    expect(rs.every((r) => r.counted)).toBe(true)
  })
})

// ---------- topMax / start logic ----------

describe('recent top (2 s window)', () => {
  it('after a 180° spike, settling to 158° with sagging hips does not drag the rest into the rep', () => {
    const tr = new Track(168).hold(500)
    tr.frames.push([tr.t, { elbow: 180, hip: 175, depth: 1 }]); tr.t += tr.dt
    tr.to(300, 158)
    tr.hip = 135; tr.hold(3000) // resting at the top, hips sagging
    tr.hip = 175; tr.hold(300).rep(1000, 70, 168).hold(1000)
    const rs = run(tr.frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
    expect(rs[0].endT - rs[0].startT).toBeLessThan(1500)
  })

  it('at 15 fps (no median) a 2-frame 180° reading then settling to 158°: the sagging rest is not judged (rep clock restarts)', () => {
    const tr = new Track(168, { fps: 15 }).hold(500).glitch(180, 2).to(300, 158)
    tr.hip = 135; tr.hold(3000)
    tr.hip = 175; tr.hold(300).rep(1000, 70, 168).hold(1000)
    const rs = run(tr.frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
    expect(rs[0].endT - rs[0].startT).toBeLessThan(2000)
  })

  it('a slow eccentric at 10°/s (constant speed) is still a rep', () => {
    expect(run(new Track().hold(500).lin(9800, 70).to(600, 168).hold(1000).frames).map(lightsOf)).toEqual(['111'])
  })

  it('slow constant-speed eccentrics at 5-8°/s (12-20 s down) are reps (4 s top window)', () => {
    for (const v of [5, 6, 8]) expect(run(new Track().hold(500).lin((98 / v) * 1000, 70).to(600, 168).hold(1000).frames).map(lightsOf), `${v}°/s`).toEqual(['111'])
  })

  it('KNOWN (edge): a 4°/s eccentric (~25 s down) never starts a rep: the 4 s window never sees a 20° drop', () => {
    expect(run(new Track().hold(500).lin(24500, 70).to(600, 168).hold(1000).frames)).toHaveLength(0)
  })

  it('relaxing the elbows at the top (175 -> 152 over 1.5 s) then a sagging rest: the rest is not judged (rep clock restarts)', () => {
    const tr = new Track(175).hold(1000).to(1500, 152)
    tr.hip = 140; tr.hold(3000)
    tr.hip = 175; tr.hold(300).rep(1000, 70, 168).hold(1000)
    const rs = run(tr.frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
    expect(rs[0].endT - rs[0].startT).toBeLessThan(2000)
  })

  it('without the spike the same sagging rest is not part of the rep', () => {
    const tr = new Track(168).hold(500).to(300, 158)
    tr.hip = 135; tr.hold(3000)
    tr.hip = 175; tr.hold(300).rep(1000, 70, 168).hold(1000)
    expect(run(tr.frames).map(lightsOf)).toEqual(['111'])
  })

  it('lockout only from noise at the start of the descent is not credited (lockout is measured on the way up)', () => {
    // Straight-arm top first (sets the top height), then the player settles bent at 150° and repeats from there.
    const tr = new Track(168).hold(1000).to(400, 150).hold(500)
    tr.frames.push([tr.t, { elbow: 168, hip: 175, depth: 1 }]); tr.t += tr.dt
    tr.rep(1000, 70, 150).hold(300).rep(1000, 70, 150).hold(1000)
    const rs = run(tr.frames)
    expect(rs).toHaveLength(2)
    expect(rs[0].lights.lockout).toBe(false)
  })
})

// ---------- median smoothing side effects ----------

describe('median smoothing at >= 20 fps', () => {
  const b2b = (ms: number, fps: number, holdMs = 0) => {
    const t = new Track(170, { fps }).hold(500)
    for (let i = 0; i < 10; i++) { t.rep(ms, 65, 170); if (holdMs) t.hold(holdMs) }
    return t.hold(1000).frames
  }

  it('back-to-back 0.6 s reps at 30 fps: all perfect on hard', () => {
    expect(run(b2b(600, 30), 'hard').every((r) => r.perfect)).toBe(true)
  })

  it('a 100 ms touch at the top keeps fast reps perfect on hard at 20 and 30 fps', () => {
    for (const fps of [20, 30]) expect(run(b2b(350, fps, 100), 'hard').map(lightsOf), `${fps} fps`).toEqual(Array(10).fill('111'))
  })

  it('15/19 fps (median off): back-to-back 0.35 s reps keep the lockout peak', () => {
    for (const fps of [15, 19]) expect(run(b2b(350, fps), 'hard').map(lightsOf), `${fps} fps`).toEqual(Array(10).fill('111'))
  })

  it('touch-and-go reps with a 170° peak keep lockout on hard at 20-30 fps (raw peak with a close neighbour counts)', () => {
    // 9 of 10 reps '110' (the last one ends in a hold). 19 fps (median off) gives 10 x '111'.
    // Still true with lockout = max(smoothed, 2nd-highest raw): the 2nd-highest raw is the neighbour of the
    // one-frame peak (e.g. 164.8° at 0.5 s / 30 fps, 160° at 20 fps), just under hard's 165°.
    const expected = Array(10).fill('111')
    expect(run(b2b(350, 20), 'hard').map(lightsOf)).toEqual(expected)
    expect(run(b2b(350, 30), 'hard').map(lightsOf)).toEqual(expected)
    expect(run(b2b(500, 30), 'hard').map(lightsOf)).toEqual(expected)
  })

  it('a 175° touch-and-go peak keeps lockout on hard at 0.35 s', () => {
    for (const fps of [20, 30]) {
      const t = new Track(175, { fps }).hold(500)
      for (let i = 0; i < 10; i++) t.rep(350, 65, 175)
      expect(run(t.hold(1000).frames, 'hard').map(lightsOf), `${fps} fps`).toEqual(Array(10).fill('111'))
    }
  })

  it('touch-and-go 0.35 s reps keep lockout on normal at 20 and 30 fps', () => {
    expect(run(b2b(350, 20)).map(lightsOf)).toEqual(Array(10).fill('111'))
    expect(run(b2b(350, 30)).map(lightsOf)).toEqual(Array(10).fill('111'))
  })

  it('frame rate dropping to 12 fps during a rep and back to 30 at the bottom: still one perfect rep', () => {
    const a = new Track(168, { fps: 30 }).hold(1000)
    const b = new Track(168, { fps: 12, t0: a.t }).to(500, 70).hold(1500)
    const c = new Track(70, { fps: 30, t0: b.t }).hold(1500).to(500, 168).hold(1000)
    expect(run([...a.frames, ...b.frames, ...c.frames]).map(lightsOf)).toEqual(['111'])
  })
})

// ---------- turn chaining ----------

describe("reps chained by a 'turn'", () => {
  it('a 28° dip (shoulders drop ~23%) and back up, then a real rep: a no-rep for the dip, then one perfect rep', () => {
    const rs = run(new Track().hold(500).to(300, 140).to(300, 160).to(500, 70).to(500, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['011', '111'])
    expect(rs.map((r) => r.counted)).toEqual([false, true])
  })

  it('a failed-lockout rep (top 135) chained into a full rep: both scored', () => {
    expect(run(new Track().hold(500).rep(1000, 70, 135).rep(1000, 70, 168).hold(1000).frames).map(lightsOf)).toEqual(['110', '111'])
  })

  it('by design: a failed lockout (135) then a small re-descent (to 110 or 105) and up MERGES into ONE rep with lockout', () => {
    // Dip rule: rising back by 20 units before dropping 45 below the turn top = same rep.
    for (const b of [110, 105]) {
      const rs = run(new Track().hold(500).rep(1000, 70, 135).rep(1000, b, 168).hold(1000).frames)
      expect(rs.map(lightsOf), `re-descent to ${b}`).toEqual(['111'])
      expect(rs[0].measured.bottomElbow).toBeLessThan(72)
    }
  })

  it('a failed lockout (135) then a full re-descent (to 70): two reps, the first without lockout', () => {
    const rs = run(new Track().hold(500).rep(1000, 70, 135).rep(1000, 70, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['110', '111'])
  })

  it('when a turn becomes a new rep, the next descent is not credited to the previous rep', () => {
    // Rep 1 only went to 105° and came up to 150°; frames from rep 2's descent must not count towards it.
    const rs = run(new Track().hold(500).rep(1000, 105, 150).rep(1000, 70, 168).hold(1000).frames)
    expect(rs).toHaveLength(2)
    expect(rs[0].lights.lockout).toBe(false)
    expect(rs[0].measured.bottomElbow).toBeGreaterThanOrEqual(104)
    expect(lightsOf(rs[1])).toBe('111')
  })

  it('a dip to 92° held 2.5 s halfway up, then a lockout, is still one good rep', () => {
    const rs = run(new Track().hold(500).to(500, 70).to(300, 120).to(250, 92).hold(2500).to(500, 168).hold(1000).frames)
    expect(rs.map(lightsOf)).toEqual(['111'])
  })

  it('finish() while turning before coming most of the way up scores nothing; a second finish() is null', () => {
    const j = new RepJudge(DIFFICULTY.normal)
    new Track().hold(500).to(500, 70).to(300, 120).to(250, 92).frames.forEach(([t, a]) => j.push(t, a))
    expect(j.currentPhase).toBe('turning')
    expect(j.finish()).toBeNull()
    expect(j.finish()).toBeNull()
  })

  it('losing the player for 2 s while turning discards the rep; reappearing near the bottom is not a new rep, the next full one counts', () => {
    const t = new Track().hold(500).to(500, 70).to(300, 120).to(250, 92)
    // After the gap only half a rep is seen (92° down to 70° and up): too little vertical travel to be an attempt.
    expect(run(t.gap(2000).hold(300).rep().hold(1000).frames).map(lightsOf)).toEqual([])
    expect(run(t.hold(500).rep().hold(1000).frames).map(lightsOf)).toEqual(['111'])
  })
})

// ---------- depth calibration ----------

describe('depth calibration (forearm-vertical model)', () => {
  it('a 70° bottom passes depth on normal (0.33 <= 0.42)', () => {
    expect(run(new Track(168, { depth: 'forearm' }).hold(500).rep().hold(1000).frames).map(lightsOf)).toEqual(['111'])
  })

  it('on hard a 70° bottom passes depth (0.33 ≤ 0.45): chest near the floor, not through it', () => {
    expect(run(new Track(168, { depth: 'forearm' }).hold(500).rep().hold(1000).frames, 'hard').map(lightsOf)).toEqual(['111'])
    expect(run(new Track(168, { depth: 'forearm' }).hold(500).rep(1000, 60).hold(1000).frames, 'hard').map(lightsOf)).toEqual(['111'])
  })
})
