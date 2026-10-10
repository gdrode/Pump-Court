// Stress tests for the whole judging pipeline as App.tsx runs it:
// raw 33-point landmarks -> side tracker -> posture gate -> referee.
// Bodies are built from a simple side-on skeleton, then optionally rotated
// (camera roll), jittered and partly dropped.
//
// Tests named 'KNOWN:' pin down weak spots as they behave today, so the suite
// stays green; flip them when the behaviour is improved.
import { describe, it, expect } from 'vitest'
import { DIFFICULTY, RepJudge, type Difficulty, type RepResult } from '../judge'
import { createSideTracker, SIDE_POINTS, type Landmark, type Side } from '../pose'
import { createPostureTracker } from '../posture'
import { rng } from './synth'

interface P { x: number; y: number }
interface Body { shoulder: P; elbow: P; wrist: P; hip: P; knee: P; ankle: P }

// ---------- skeleton ----------

/** Frame-height units; x already scaled by the aspect ratio. Roughly adult proportions. */
const B = { L: 0.66, U: 0.15, F: 0.14, hipFrac: 0.37, kneeFrac: 0.68, floor: 0.88, hTop: 0.2895, hBot: 0.08 }
const ASPECT = 16 / 9

const add = (a: P, b: P, k = 1): P => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

/** Elbow for a two-link arm, bent towards `towards` (x direction, ±1). */
function elbowIK(sh: P, wr: P, towards: number): P {
  const d = Math.min(dist(sh, wr), B.U + B.F - 1e-6)
  const ux = (wr.x - sh.x) / (dist(sh, wr) || 1), uy = (wr.y - sh.y) / (dist(sh, wr) || 1)
  const a = (B.U * B.U - B.F * B.F + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, B.U * B.U - a * a))
  let px = -uy, py = ux
  if (px * towards < 0 || (px === 0 && py > 0)) { px = -px; py = -py }
  return { x: sh.x + ux * a + px * h, y: sh.y + uy * a + py * h }
}

interface PlankOpts {
  /** +1: head to the right of the feet, -1: head to the left. */
  dir?: number
  /** Ankle x. */
  ax?: number
  /** Abdomen pushed towards the floor (+, sag) or away from it (-, pike), frame units. */
  sag?: number
  /** Shoulder height of the top position, which fixes where the hands are planted. */
  hTop?: number
}

/** Rigid plank pivoting on the toes, shoulder `h` above the wrists, hands planted under the top-position shoulder. */
function plank(h: number, o: PlankOpts = {}): Body {
  const dir = o.dir ?? 1
  const ax = o.ax ?? (dir > 0 ? 0.5 : ASPECT - 0.5)
  const hTop = o.hTop ?? B.hTop
  const ankle = { x: ax, y: B.floor - 0.02 }
  const wristY = B.floor - 0.01
  const shAt = (hh: number) => ({ x: ax + dir * Math.sqrt(B.L ** 2 - (ankle.y - (wristY - hh)) ** 2), y: wristY - hh })
  const shoulder = shAt(h)
  const wrist = { x: shAt(hTop).x, y: wristY }
  const u = { x: (ankle.x - shoulder.x) / B.L, y: (ankle.y - shoulder.y) / B.L }
  // Normal pointing down (towards the floor).
  let n = { x: -u.y, y: u.x }
  if (n.y < 0) n = { x: -n.x, y: -n.y }
  const sag = o.sag ?? 0
  const hip = add(add(shoulder, u, B.L * B.hipFrac), n, sag)
  const knee = add(add(shoulder, u, B.L * B.kneeFrac), n, sag * 0.45)
  return { shoulder, elbow: elbowIK(shoulder, wrist, -dir), wrist, hip, knee, ankle }
}

/** Shoulder height for a rep at phase 0..1 (0 = top, 0.5 = bottom). */
const repH = (ph: number, hBot = B.hBot, hTop = B.hTop) => hTop - (hTop - hBot) * (1 - Math.cos(2 * Math.PI * ph)) / 2

/** Sitting on a chair, side-on. `curl` 0..1 swings the forearm up; `shrug` lifts the shoulder. */
function sitting(o: { dir?: number; curl?: number; shrug?: number; lean?: number } = {}): Body {
  const dir = o.dir ?? 1
  const x0 = ASPECT / 2
  const hip = { x: x0, y: 0.6 }
  const lean = ((o.lean ?? 5) * Math.PI) / 180
  const shoulder = { x: x0 + dir * 0.26 * Math.sin(lean), y: 0.6 - 0.26 * Math.cos(lean) - (o.shrug ?? 0) }
  const knee = { x: x0 + dir * 0.22, y: 0.6 }
  const ankle = { x: x0 + dir * 0.22, y: 0.86 }
  const elbow = { x: shoulder.x + dir * 0.02, y: shoulder.y + B.U }
  const th = (0.35 + 2.2 * (o.curl ?? 0)) // radians from hanging down, forwards
  const wrist = { x: elbow.x + dir * B.F * Math.sin(th), y: elbow.y + B.F * Math.cos(th) }
  return { shoulder, elbow, wrist, hip, knee, ankle }
}

function standing(dir = 1): Body {
  const x0 = ASPECT / 2
  return {
    shoulder: { x: x0, y: 0.22 }, elbow: { x: x0, y: 0.37 }, wrist: { x: x0 + dir * 0.02, y: 0.51 },
    hip: { x: x0, y: 0.5 }, knee: { x: x0 + dir * 0.01, y: 0.7 }, ankle: { x: x0, y: 0.9 },
  }
}

/** On all fours: hands under the shoulders, knees under the hips, shins on the floor. */
function tabletop(dir = 1, h = B.hTop): Body {
  const wrist = { x: ASPECT / 2 + dir * 0.2, y: B.floor - 0.01 }
  const shoulder = { x: wrist.x, y: wrist.y - h }
  const hip = { x: shoulder.x - dir * B.L * B.hipFrac, y: wrist.y - B.hTop }
  const knee = { x: hip.x, y: B.floor - 0.02 }
  const ankle = { x: knee.x - dir * 0.2, y: B.floor - 0.01 }
  return { shoulder, elbow: elbowIK(shoulder, wrist, -dir), wrist, hip, knee, ankle }
}

/** Tall kneeling: knees on the floor, trunk upright, hands at the sides. */
function kneelingUp(dir = 1): Body {
  const x0 = ASPECT / 2
  const knee = { x: x0, y: B.floor - 0.02 }
  const hip = { x: x0, y: knee.y - 0.2 }
  const shoulder = { x: x0, y: hip.y - 0.26 }
  return {
    shoulder, elbow: { x: x0, y: shoulder.y + B.U }, wrist: { x: x0 + dir * 0.02, y: shoulder.y + B.U + B.F },
    hip, knee, ankle: { x: x0 - dir * 0.2, y: B.floor - 0.01 },
  }
}

const lerpBody = (a: Body, b: Body, k: number): Body => {
  const out = {} as Body
  for (const key of Object.keys(a) as (keyof Body)[]) out[key] = { x: a[key].x + (b[key].x - a[key].x) * k, y: a[key].y + (b[key].y - a[key].y) * k }
  return out
}

// ---------- body -> landmarks ----------

interface CamOpts {
  /** Which side of the body faces the camera. */
  near?: Side
  /** Camera roll, degrees. */
  tilt?: number
  /** Uniform jitter on every coordinate, ± this fraction of the frame. */
  noise?: number
  seed?: number
}

function camera(o: CamOpts = {}) {
  const r = rng(o.seed ?? 3)
  const near = o.near ?? 'left'
  const far: Side = near === 'left' ? 'right' : 'left'
  const th = ((o.tilt ?? 0) * Math.PI) / 180
  const cx = ASPECT / 2, cy = 0.5
  const j = () => (o.noise ? (r() * 2 - 1) * o.noise : 0)
  const rot = (p: P): P => ({
    x: cx + (p.x - cx) * Math.cos(th) - (p.y - cy) * Math.sin(th),
    y: cy + (p.x - cx) * Math.sin(th) + (p.y - cy) * Math.cos(th),
  })
  return (b: Body, vis = 0.95): Landmark[] => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }))
    const head = rot(add(b.shoulder, { x: (b.shoulder.x - b.hip.x) * 0.4, y: -0.05 }))
    for (let i = 0; i <= 10; i++) lm[i] = { x: head.x / ASPECT + j(), y: head.y + j(), z: 0, visibility: 0.9 }
    const roles = Object.keys(SIDE_POINTS.left) as (keyof Body)[]
    for (const role of roles) {
      const p = rot(b[role])
      lm[SIDE_POINTS[near][role]] = { x: p.x / ASPECT + j(), y: p.y + j(), z: 0, visibility: vis }
      lm[SIDE_POINTS[far][role]] = { x: (p.x + 0.01) / ASPECT + j(), y: p.y - 0.005 + j(), z: 0.2, visibility: 0.3 }
    }
    return lm
  }
}

// ---------- scenario timeline ----------

type Frame = [number, Landmark[] | undefined]

class Scene {
  frames: Frame[] = []
  t = 0
  readonly dt: number
  readonly cam: ReturnType<typeof camera>
  constructor(o: CamOpts & { fps?: number } = {}) {
    this.dt = 1000 / (o.fps ?? 30)
    this.cam = camera(o)
  }
  /** `ms` of frames; `f` gets the 0..1 progress and returns a body (or null for no detection). */
  run(ms: number, f: (k: number, t: number) => Body | null, vis?: (k: number) => number) {
    const n = Math.max(1, Math.round(ms / this.dt))
    for (let i = 0; i < n; i++) {
      const k = i / n
      const b = f(k, this.t)
      this.frames.push([this.t, b ? this.cam(b, vis ? vis(k) : 0.95) : undefined])
      this.t += this.dt
    }
    return this
  }
  hold(ms: number, b: Body) { return this.run(ms, () => b) }
  /** `n` push-ups of `ms` each. */
  reps(n: number, ms: number, o: PlankOpts & { hBot?: number; hTopReached?: number } = {}) {
    return this.run(n * ms, (k) => {
      const ph = (k * n) % 1
      return plank(repH(ph, o.hBot, o.hTopReached ?? o.hTop ?? B.hTop), o)
    })
  }
}

/** Exactly what App.tsx does per frame. */
function judge(frames: Frame[], diff: Difficulty = 'normal') {
  const tracker = createSideTracker()
  const posture = createPostureTracker()
  const j = new RepJudge(DIFFICULTY[diff])
  const out: RepResult[] = []
  let readyFrames = 0
  for (const [t, pose] of frames) {
    const a = tracker.update(pose, ASPECT)
    const pos = posture.update(t, a)
    if (pos.ready) readyFrames++
    const r = j.push(t, a && { elbow: a.elbow, hip: a.abdomen, knee: a.knee, bodyOffset: a.bodyOffset, depth: pos.height, shoulderY: a.shoulderY, ready: pos.ready })
    if (r) out.push(r)
  }
  const last = j.finish()
  if (last) out.push(last)
  return Object.assign(out, { readyFrames, side: tracker.side })
}

const counted = (rs: RepResult[]) => rs.filter((r) => r.counted).length

// ---------- tests ----------

describe('stress: not in position never counts', () => {
  for (const noise of [0.02, 0.03]) {
    for (const seed of [1, 2, 3]) {
      it(`sitting still for 60 s, jitter ±${noise * 100}% (seed ${seed})`, () => {
        const rs = judge(new Scene({ noise, seed }).hold(60_000, sitting()).frames)
        expect(rs).toHaveLength(0)
        expect(rs.readyFrames).toBe(0)
      })
      it(`standing still for 60 s, jitter ±${noise * 100}% (seed ${seed})`, () => {
        expect(judge(new Scene({ noise, seed }).hold(60_000, standing()).frames)).toHaveLength(0)
      })
    }
  }

  it('sitting, slumped or leaning back a little, with jitter', () => {
    for (const lean of [-20, -10, 15, 25]) {
      expect(judge(new Scene({ noise: 0.025, seed: lean + 50 }).hold(20_000, sitting({ lean })).frames)).toHaveLength(0)
    }
  })

  it('sitting doing arm curls (both sides, with jitter) counts nothing', () => {
    for (const near of ['left', 'right'] as Side[]) {
      for (const dir of [1, -1]) {
        const s = new Scene({ near, noise: 0.02, seed: dir + 7 })
        s.run(40_000, (_, t) => sitting({ dir, curl: (1 - Math.cos((2 * Math.PI * t) / 1500)) / 2 }))
        expect(judge(s.frames)).toHaveLength(0)
      }
    }
  })

  it('sitting doing shoulder shrugs counts nothing', () => {
    const s = new Scene({ noise: 0.02 })
    s.run(30_000, (_, t) => sitting({ shrug: 0.05 * (1 - Math.cos((2 * Math.PI * t) / 1200)) / 2 }))
    expect(judge(s.frames)).toHaveLength(0)
  })

  it('sitting with the camera rolled 15 degrees, arms moving, counts nothing', () => {
    for (const tilt of [-15, 15]) {
      const s = new Scene({ tilt, noise: 0.02 })
      s.run(30_000, (_, t) => sitting({ curl: (1 - Math.cos((2 * Math.PI * t) / 1300)) / 2 }))
      expect(judge(s.frames)).toHaveLength(0)
    }
  })

  it('tall kneeling, still and with jitter, counts nothing', () => {
    expect(judge(new Scene({ noise: 0.025 }).hold(30_000, kneelingUp()).frames)).toHaveLength(0)
  })

  it('on all fours, still with jitter, counts nothing', () => {
    expect(judge(new Scene({ noise: 0.025 }).hold(30_000, tabletop()).frames)).toHaveLength(0)
  })

  it('lying flat on the floor, fidgeting, counts nothing', () => {
    const s = new Scene({ noise: 0.02 })
    s.run(30_000, (_, t) => plank(0.04 + 0.02 * Math.sin(t / 300)))
    expect(judge(s.frames)).toHaveLength(0)
  })

  it('holding a plank at the top for 60 s with heavy jitter counts nothing', () => {
    for (const seed of [1, 2, 3, 4]) {
      const rs = judge(new Scene({ noise: 0.025, seed }).hold(60_000, plank(B.hTop)).frames)
      expect(rs).toHaveLength(0)
    }
  })

  it('ready in a plank, then kneel up and do arm curls: no reps (stays not ready)', () => {
    const s = new Scene({ noise: 0.015 })
    s.hold(1500, plank(B.hTop))
    s.run(1200, (k) => lerpBody(plank(B.hTop), kneelingUp(), k))
    s.run(20_000, (_, t) => {
      const b = kneelingUp()
      const th = 0.35 + 2.2 * (1 - Math.cos(t / 250)) / 2
      return { ...b, wrist: { x: b.elbow.x + B.F * Math.sin(th), y: b.elbow.y + B.F * Math.cos(th) } }
    })
    expect(judge(s.frames)).toHaveLength(0)
  })

  it('ready in a plank, then sit up onto a chair and curl: no reps', () => {
    const s = new Scene({ noise: 0.015 })
    s.hold(1500, plank(B.hTop))
    s.run(1500, (k) => lerpBody(plank(B.hTop), sitting(), k))
    s.run(20_000, (_, t) => sitting({ curl: (1 - Math.cos(t / 250)) / 2 }))
    expect(judge(s.frames)).toHaveLength(0)
  })

  it('sit -> stand -> walk -> sit again, repeatedly, counts nothing', () => {
    const s = new Scene({ noise: 0.02 })
    for (let i = 0; i < 5; i++) {
      s.run(1500, (k) => lerpBody(sitting(), standing(), k))
      s.hold(2000, standing())
      s.run(1500, (k) => lerpBody(standing(), sitting(), k))
      s.run(3000, (_, t) => sitting({ curl: (1 - Math.cos(t / 200)) / 2 }))
    }
    expect(judge(s.frames)).toHaveLength(0)
  })
})

describe('stress: getting into position', () => {
  it('lying -> push up into a plank -> hold -> 3 reps counts exactly 3', () => {
    const s = new Scene({ noise: 0.01 })
    s.hold(2000, plank(0.04))
    s.run(800, (k) => plank(0.04 + (B.hTop - 0.04) * k))
    s.hold(1000, plank(B.hTop))
    s.reps(3, 1500)
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(rs).toHaveLength(3)
    expect(rs.every((r) => r.counted)).toBe(true)
  })

  it('all fours -> walk the knees back into a plank -> 3 reps counts exactly 3', () => {
    const s = new Scene({ noise: 0.01 })
    s.hold(2000, tabletop())
    s.run(1500, (k) => lerpBody(tabletop(), plank(B.hTop), k))
    s.hold(1000, plank(B.hTop))
    s.reps(3, 1500)
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(rs).toHaveLength(3)
    expect(rs.every((r) => r.perfect)).toBe(true)
  })

  it('standing -> bend down -> kneel -> plank, then stand back up, counts nothing', () => {
    const s = new Scene({ noise: 0.015 })
    s.hold(2000, standing())
    s.run(1500, (k) => lerpBody(standing(), kneelingUp(), k))
    s.run(1500, (k) => lerpBody(kneelingUp(), tabletop(), k))
    s.run(1500, (k) => lerpBody(tabletop(), plank(B.hTop), k))
    s.hold(2000, plank(B.hTop))
    s.run(1500, (k) => lerpBody(plank(B.hTop), tabletop(), k))
    s.run(1500, (k) => lerpBody(tabletop(), kneelingUp(), k))
    s.run(1500, (k) => lerpBody(kneelingUp(), standing(), k))
    s.hold(2000, standing())
    expect(judge(s.frames)).toHaveLength(0)
  })
})

describe('stress: clean push-ups', () => {
  const session = (o: CamOpts & { fps?: number; repMs: number; n: number; dir?: number }) => {
    const s = new Scene(o)
    s.hold(1500, sitting({ dir: o.dir }))
    s.hold(1200, plank(B.hTop, { dir: o.dir }))
    s.reps(o.n, o.repMs, { dir: o.dir })
    s.hold(1000, plank(B.hTop, { dir: o.dir }))
    s.hold(1500, sitting({ dir: o.dir }))
    return judge(s.frames)
  }

  for (const repMs of [1000, 1500, 2500, 4000]) {
    it(`${repMs} ms per rep: 8 reps, all perfect`, () => {
      const rs = session({ repMs, n: 8, noise: 0.005 })
      expect(rs).toHaveLength(8)
      expect(rs.every((r) => r.perfect)).toBe(true)
    })
  }

  it('700 ms per rep (flat out): 8 reps, all counted', () => {
    const rs = session({ repMs: 700, n: 8, noise: 0.005 })
    expect(rs).toHaveLength(8)
    expect(counted(rs)).toBe(8)
  })

  for (const fps of [15, 24, 60]) {
    it(`${fps} fps, 1 s reps: 6 reps counted`, () => {
      const rs = session({ fps, repMs: 1000, n: 6, noise: 0.005 })
      expect(rs).toHaveLength(6)
      expect(counted(rs)).toBe(6)
    })
  }

  for (const near of ['left', 'right'] as Side[]) {
    for (const dir of [1, -1]) {
      it(`${near} side to the camera, head ${dir > 0 ? 'right' : 'left'}: 5 perfect reps, tracked on the ${near}`, () => {
        const rs = session({ near, dir, repMs: 1200, n: 5, noise: 0.005 })
        expect(rs).toHaveLength(5)
        expect(rs.every((r) => r.perfect)).toBe(true)
        expect(rs.side).toBe(near)
      })
    }
  }

  for (const tilt of [-8, -4, 4, 8]) {
    for (const dir of [1, -1]) {
      it(`camera rolled ${tilt}°, head ${dir > 0 ? 'right' : 'left'}: 5 reps counted`, () => {
        const rs = session({ tilt, dir, repMs: 1200, n: 5, noise: 0.005 })
        expect(rs).toHaveLength(5)
        expect(counted(rs)).toBe(5)
      })
    }
  }

  it('landmark jitter ±1%: 10 reps counted, no extras', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rs = session({ repMs: 1500, n: 10, noise: 0.01, seed })
      expect(rs).toHaveLength(10)
      expect(counted(rs)).toBe(10)
    }
  })

  it('KNOWN: jitter ±2% sometimes splits a descent into an extra failed attempt (count stays right)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rs = session({ repMs: 1500, n: 10, noise: 0.02, seed })
      expect(counted(rs)).toBe(10)
      expect(rs.length).toBeLessThanOrEqual(11)
    }
  })

  // Regression: the rolling median's buffers went stale while smoothing was
  // off, so a frame rate hovering around 20 fps (switching smoothing on and
  // off) produced phantom reps from old values.
  for (const fps of [19, 20, 21]) {
    it(`${fps} fps with ±5 ms timestamp jitter: exactly 8 reps`, () => {
      const s = new Scene({ fps, noise: 0.005 })
      s.hold(1200, plank(B.hTop))
      s.reps(8, 1200)
      s.hold(1000, plank(B.hTop))
      const r = rng(fps)
      const rs = judge(s.frames.map(([t, p]) => [t + (r() - 0.5) * 10, p] as Frame))
      expect(rs).toHaveLength(8)
      expect(counted(rs)).toBe(8)
    })
  }

  it('KNOWN: camera rolled 10° or more the unlucky way never gets ready (plank already tilts ~25°, limit 35°)', () => {
    for (const [tilt, dir] of [[-12, 1], [12, -1]]) {
      const s = new Scene({ tilt, noise: 0.005 })
      s.hold(1200, plank(B.hTop, { dir }))
      s.reps(3, 1500, { dir })
      const rs = judge(s.frames)
      expect(rs).toHaveLength(0)
      expect(rs.readyFrames).toBe(0)
    }
  })
})

describe('stress: form faults', () => {
  /** Gets ready in a straight plank, eases into the fault, then 4 reps with it. */
  const faulted = (sag: number, diff: Difficulty = 'normal') => {
    const s = new Scene({ noise: 0.005 })
    s.hold(1200, plank(B.hTop))
    s.run(800, (k) => plank(B.hTop, { sag: sag * k }))
    s.reps(4, 1500, { sag })
    s.hold(1000, plank(B.hTop, { sag }))
    return judge(s.frames, diff)
  }

  it('sagging hips: torso light red, fault says sagging, never perfect', () => {
    const rs = faulted(0.12)
    expect(rs).toHaveLength(4)
    for (const r of rs) {
      expect(r.lights.torso).toBe(false)
      expect(r.perfect).toBe(false)
      expect(r.faults.join(' ')).toMatch(/sagging/)
    }
  })

  // Regression: a sag big enough to fail the abdomen angle also tilts the
  // shoulder–hip line past the posture gate, so the player was dropped as
  // 'not-down' and the reps vanished instead of being flagged.
  it('hips sagging after getting ready: reps still judged and flagged, not dropped', () => {
    for (const sag of [0.1, 0.12]) {
      const rs = faulted(sag)
      expect(rs).toHaveLength(4)
      expect(rs.every((r) => !r.lights.torso && /sagging/.test(r.faults.join(' ')))).toBe(true)
    }
  })

  it('KNOWN: a moderate sag (about 12% of body length) still passes Normal', () => {
    expect(faulted(0.08).every((r) => r.perfect)).toBe(true)
  })

  it('piked hips: torso light red, fault says piked, never perfect', () => {
    const rs = faulted(-0.13)
    expect(rs).toHaveLength(4)
    for (const r of rs) {
      expect(r.lights.torso).toBe(false)
      expect(r.faults.join(' ')).toMatch(/piked/)
    }
  })

  it('a slight sag passes on easy but not on hard; a pike likewise', () => {
    expect(faulted(0.06, 'easy').every((r) => r.lights.torso)).toBe(true)
    const hard = faulted(0.06, 'hard')
    expect(hard).toHaveLength(4)
    expect(hard.every((r) => !r.lights.torso)).toBe(true)
    const pikeHard = faulted(-0.07, 'hard')
    expect(pikeHard).toHaveLength(4)
    expect(pikeHard.every((r) => !r.lights.torso && /piked/.test(r.faults.join(' ')))).toBe(true)
  })

  it('KNOWN: a clear pike (hips ~0.1 of body length up) still passes Normal', () => {
    expect(faulted(-0.07).every((r) => r.lights.torso)).toBe(true)
  })

  it('half reps: depth light red, no perfect reps', () => {
    // Shoulders drop ~27% of the top height: an attempt (over minAttemptDrop) but short of Normal's depthDrop.
    const s = new Scene({ noise: 0.005 })
    s.hold(1200, plank(B.hTop))
    s.reps(5, 1200, { hBot: 0.21 })
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(rs.every((r) => !r.lights.depth && !r.perfect)).toBe(true)
    expect(rs.every((r) => r.faults.some((f) => /Not deep enough/.test(f)))).toBe(true)
  })

  it('tiny bounces at the top are not attempts at all', () => {
    const s = new Scene({ noise: 0.005 })
    s.hold(1200, plank(B.hTop))
    s.reps(10, 800, { hBot: 0.24 })
    s.hold(1000, plank(B.hTop))
    expect(judge(s.frames)).toHaveLength(0)
  })

  it('knee push-ups from all fours never get ready, so nothing counts', () => {
    const s = new Scene({ noise: 0.005 })
    s.hold(1500, tabletop())
    s.run(6000, (k) => tabletop(1, repH((k * 4) % 1, 0.1)))
    s.hold(1000, tabletop())
    expect(judge(s.frames)).toHaveLength(0)
  })
})

describe('stress: dropped frames and landmark loss', () => {
  const base = () => {
    const s = new Scene({ noise: 0.005 })
    s.hold(1200, plank(B.hTop))
    return s
  }

  it('random 20% dropped detections: 8 reps still counted', () => {
    const r = rng(11)
    const s = base()
    s.run(8 * 1500, (k) => (r() < 0.2 ? null : plank(repH((k * 8) % 1))))
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(rs).toHaveLength(8)
    expect(counted(rs)).toBe(8)
  })

  it('a 300 ms blackout at the bottom of each rep still counts every rep', () => {
    const s = base()
    s.run(6 * 1500, (k) => {
      const ph = (k * 6) % 1
      return ph > 0.4 && ph < 0.6 ? null : plank(repH(ph))
    })
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(rs).toHaveLength(6)
  })

  it('a 300 ms low-visibility patch mid-rep still counts every rep', () => {
    const s = base()
    s.run(6 * 1500, (k) => plank(repH((k * 6) % 1)), (k) => {
      const ph = (k * 6) % 1
      return ph > 0.25 && ph < 0.45 ? 0.2 : 0.95
    })
    s.hold(1000, plank(B.hTop))
    expect(judge(s.frames)).toHaveLength(6)
  })

  it('a 3 s blackout mid-rep drops that rep only, then counting resumes', () => {
    const s = base()
    s.reps(2, 1500)
    s.run(750, (k) => plank(repH(k / 2)))
    s.run(3000, () => null)
    s.run(750, (k) => plank(repH(0.5 + k / 2)))
    s.hold(1000, plank(B.hTop))
    s.reps(2, 1500)
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(counted(rs)).toBe(4)
  })

  const garbage: Body = { shoulder: { x: 0.9, y: 0.5 }, elbow: { x: 0.9, y: 0.5 }, wrist: { x: 0.9, y: 0.5 }, hip: { x: 0.9, y: 0.5 }, knee: { x: 0.9, y: 0.5 }, ankle: { x: 0.9, y: 0.5 } }
  /** Holding a plank, with a burst of `len` garbage frames (skeleton collapsed to a point) every 2 s. */
  const glitchy = (len: number, seed: number) => {
    const s = new Scene({ noise: 0.005, seed })
    s.hold(1200, plank(B.hTop))
    for (let i = 0; i < 15; i++) s.hold(2000, plank(B.hTop)).run(len * 33.4, () => garbage)
    return judge(s.frames)
  }

  // Regression: during the posture grace period the shoulder height was still
  // reported from the garbage skeleton, so a short burst looked like the body
  // dropping from a high top and made failed (once even counted) phantom reps.
  it('bursts of 1-3 garbage frames while holding a plank make no rep at all', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const len of [1, 2, 3]) expect(glitchy(len, seed)).toHaveLength(0)
    }
  })

  it('the wrist alone dropping out at the bottom keeps the depth reading', () => {
    const s = base()
    s.run(5 * 1500, (k) => plank(repH((k * 5) % 1)))
    const frames = s.frames.map(([t, p]) => {
      if (!p || t < 1200) return [t, p] as Frame
      const ph = ((t - 1200) / 1500) % 1
      if (ph < 0.4 || ph > 0.6) return [t, p] as Frame
      const lm = p.map((l) => ({ ...l }))
      lm[SIDE_POINTS.left.wrist].visibility = 0.1
      return [t, lm] as Frame
    })
    const rs = judge(frames)
    expect(rs).toHaveLength(5)
    expect(rs.every((r) => r.lights.depth)).toBe(true)
  })

  it('arm points dropping out (low visibility) at the bottom: rep still counted', () => {
    const s = base()
    // MediaPipe often loses the near arm when it's hidden by the chest at the bottom.
    s.run(5 * 1500, (k) => plank(repH((k * 5) % 1)), (k) => {
      const ph = (k * 5) % 1
      return ph > 0.42 && ph < 0.58 ? 0.4 : 0.95
    })
    s.hold(1000, plank(B.hTop))
    const rs = judge(s.frames)
    expect(rs).toHaveLength(5)
    expect(counted(rs)).toBe(5)
  })
})
