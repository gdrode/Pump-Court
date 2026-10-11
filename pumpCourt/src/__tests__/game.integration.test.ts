// The full chain App.tsx runs per player: posture → judge → game, on synthetic bodies.
import { describe, it, expect } from 'vitest'
import { COUNTDOWN_MS, addRep, createGame, goodReps, tick, type GameState, type Mode, type PlayerLive } from '../game'
import { DIFFICULTY, RepJudge } from '../judge'
import type { PoseAngles } from '../pose'
import { createPostureTracker } from '../posture'

const plank = (o: Partial<PoseAngles> = {}): PoseAngles => ({
  side: 'left', elbow: 170, hip: 177, hipFlex: 177, abdomen: 177, bodyOffset: 0, knee: 176,
  visibility: 0.9, shoulderY: 0.46, depth: 0.95, trunkTilt: 15, bodyTilt: 12,
  wrist: { x: 0.5, y: 0.7 }, wristVisibility: 0.9, shoulderX: 0.5, armLength: 0.25, ...o,
})
const sitting = () => plank({ trunkTilt: 85, bodyTilt: 60, elbow: 120 })

/** A player's body over time: `script(t)` gives the pose at time t (ms). */
type Script = (t: number) => PoseAngles

/** One clean push-up of `ms` length starting at t0, then holding the top. */
const pushups = (t0: number, every: number, ms = 1000): Script => (t) => {
  if (t < t0) return plank()
  const k = ((t - t0) % every) / ms
  if (k >= 1) return plank()
  const u = Math.sin(Math.PI * k)
  return plank({ elbow: 170 - 100 * u, shoulderY: 0.46 + 0.19 * u, trunkTilt: 15 - 10 * u })
}

function play(mode: Mode, scripts: Script[], until: number) {
  let g: GameState = createGame(mode, scripts.length as 1 | 2)
  const postures = scripts.map(() => createPostureTracker())
  let judges: (RepJudge | null)[] = scripts.map(() => null)
  const live: PlayerLive[] = scripts.map(() => ({ ready: false, inRep: false }))
  let countdownAt: number | null = null
  for (let t = 0; t <= until; t += 33) {
    scripts.forEach((s, i) => {
      const a = s(t)
      const pos = postures[i].update(t, a)
      const j = judges[i]
      live[i] = { ready: pos.ready, inRep: !!j && j.currentPhase !== 'top' }
      if (g.phase === 'running' && j) {
        const rep = j.push(t, { elbow: a.elbow, hip: a.abdomen, knee: a.knee, bodyOffset: a.bodyOffset, depth: pos.height, shoulderY: a.shoulderY, ready: pos.ready })
        if (rep) g = addRep(g, i, rep, t)
      }
    })
    if (t % 99 === 0) {
      const before = g.phase
      g = tick(g, t, live)
      if (before !== 'countdown' && g.phase === 'countdown') countdownAt = t
      if (before !== 'running' && g.phase === 'running') judges = scripts.map(() => new RepJudge(DIFFICULTY.hard))
      if (g.phase === 'finished') break
    }
  }
  return { g, countdownAt }
}

describe('a full round', () => {
  it('single sprint: waits for position, counts down, counts reps for 30 s, then stops', () => {
    // Sits for 3 s, gets into position, then does a push-up every 1.5 s from t=7 s.
    const script: Script = (t) => (t < 3000 ? sitting() : pushups(7000, 1500)(t))
    const { g, countdownAt } = play('sprint', [script], 60_000)
    expect(countdownAt).toBeGreaterThan(3000)
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('time')
    expect(g.endT! - g.startT!).toBe(30_000)
    // ~30 s / 1.5 s ≈ 20 reps (give or take one at each end).
    expect(goodReps(g.players[0])).toBeGreaterThanOrEqual(18)
    expect(goodReps(g.players[0])).toBeLessThanOrEqual(21)
    expect(g.players[0].results.every((r) => r.perfect)).toBe(true)
  })

  it('co-op: the countdown waits for the slower player, then both score independently', () => {
    const fast: Script = pushups(5000, 1200)
    const late: Script = (t) => (t < 9000 ? sitting() : pushups(14_000, 2400)(t))
    const { g, countdownAt } = play('sprint', [fast, late], 60_000)
    expect(countdownAt).toBeGreaterThan(9000)
    expect(g.phase).toBe('finished')
    expect(goodReps(g.players[0])).toBeGreaterThan(goodReps(g.players[1]))
    expect(goodReps(g.players[1])).toBeGreaterThan(5)
  })

  it('sitting the whole time never starts the countdown and never counts', () => {
    const { g, countdownAt } = play('sprint', [() => sitting()], 30_000)
    expect(countdownAt).toBeNull()
    expect(g.phase).toBe('waiting')
  })

  it('max: ends when the player stands up, keeping the reps done', () => {
    const script: Script = (t) => (t < 20_000 ? pushups(5000, 1500)(t) : plank({ trunkTilt: 85, bodyTilt: 80 }))
    const { g } = play('max', [script], 60_000)
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('left')
    expect(goodReps(g.players[0])).toBeGreaterThan(5)
    expect(g.endT).toBeLessThan(20_000 + 3000)
  })

  it('max: ends when stuck at the bottom (can’t press up)', () => {
    const stuck = plank({ elbow: 70, shoulderY: 0.65, trunkTilt: 5 })
    const script: Script = (t) => (t < 12_000 ? pushups(5000, 1500)(t) : t < 12_500 ? pushups(12_000, 1500, 1000)(t) : stuck)
    const { g } = play('max', [script], 60_000)
    expect(g.players[0].finished).toBe('stuck')
  })

  it('countdown lasts 3 s', () => {
    expect(COUNTDOWN_MS).toBe(3000)
  })
})

describe('plank required to start', () => {
  it('a player on their knees never starts the countdown', () => {
    const { g, countdownAt } = play('sprint', [() => plank({ knee: 100 })], 20_000)
    expect(countdownAt).toBeNull()
    expect(g.phase).toBe('waiting')
  })

  it('co-op: one player kneeling holds the countdown until they get into a plank', () => {
    const p1: Script = pushups(20_000, 1500)
    const p2: Script = (t) => (t < 8000 ? plank({ knee: 100 }) : pushups(20_000, 1500)(t))
    const { countdownAt } = play('sprint', [p1, p2], 15_000)
    expect(countdownAt).toBeGreaterThan(8000)
  })
})

describe('quarter reps and adjustments', () => {
  /** Shoulders dip by `share` of their height and come back, `n` times. */
  const dips = (share: number, n: number): Script => (t) => {
    if (t < 5000) return plank()
    const k = ((t - 5000) % 1200) / 1000
    if (t > 5000 + n * 1200 || k >= 1) return plank()
    const u = Math.sin(Math.PI * k)
    // Height above the hands' floor line = 0.7 − 0.46 = 0.24 at the top; drop a share of it.
    return plank({ elbow: 170 - 40 * u * share * 4, shoulderY: 0.46 + 0.24 * share * u })
  }

  it('quarter reps (shoulders drop ~20%) are no-reps: Depth red, never counted', () => {
    const { g } = play('sprint', [dips(0.2, 15)], 40_000)
    const rs = g.players[0].results
    expect(rs.length).toBeGreaterThan(0)
    expect(rs.every((r) => !r.counted && !r.lights.depth)).toBe(true)
  })

  it('small adjustments at the top (10%) are ignored', () => {
    const { g } = play('sprint', [dips(0.1, 15)], 40_000)
    expect(g.players[0].results).toHaveLength(0)
  })

  it('a rep to 30% gets judged but fails depth on Hard (needs 35%): not perfect', () => {
    const { g } = play('sprint', [dips(0.3, 10)], 40_000)
    const rs = g.players[0].results
    expect(rs.length).toBeGreaterThan(5)
    expect(rs.every((r) => !r.lights.depth && !r.perfect)).toBe(true)
  })

  it('a conventional rep (shoulders drop ~45%) passes depth', () => {
    const { g } = play('sprint', [dips(0.45, 10)], 40_000)
    const rs = g.players[0].results
    expect(rs.length).toBeGreaterThan(5)
    expect(rs.every((r) => r.lights.depth)).toBe(true)
  })
})
