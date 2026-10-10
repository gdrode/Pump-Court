import { describe, it, expect } from 'vitest'
import { addRep, clock, COUNTDOWN_MS, countdownLeft, createGame, endGame, FAILURE, failLeft, failWindow, formatClock, fmtPoints, points, repPoints, score, streakMultiplier, streakTier, tick, winner, type GameState, type PlayerLive } from '../game'
import type { RepResult } from '../judge'

const rep = (counted = true, perfect = counted): RepResult => ({
  rep: 1, startT: 0, endT: 0, lights: { depth: counted, torso: counted, lockout: perfect }, whiteCount: perfect ? 3 : counted ? 2 : 1,
  counted, perfect, measured: { depth: 0.2, depthDrop: 0.8, bottomElbow: 70, hip: 175, knee: 175, lockout: 170 }, faults: [],
})
const R: PlayerLive = { ready: true, inRep: false }
const OUT: PlayerLive = { ready: false, inRep: false }

/** Runs ticks every 100 ms from t0 to t1 with a fixed live state. */
function run(g: GameState, t0: number, t1: number, live: PlayerLive[]) {
  for (let t = t0; t <= t1; t += 100) g = tick(g, t, live)
  return g
}

describe('waiting and countdown', () => {
  it('waits until every player is in position', () => {
    let g = createGame('sprint', 2)
    g = run(g, 0, 5000, [R, OUT])
    expect(g.phase).toBe('waiting')
    g = tick(g, 5100, [R, R])
    expect(g.phase).toBe('countdown')
  })

  it('counts 3-2-1, then runs', () => {
    let g = tick(createGame('sprint', 1), 0, [R])
    expect(countdownLeft(g, 0)).toBe(3)
    expect(countdownLeft(g, 1500)).toBe(2)
    expect(countdownLeft(g, 2500)).toBe(1)
    g = tick(g, COUNTDOWN_MS - 1, [R])
    expect(g.phase).toBe('countdown')
    g = tick(g, COUNTDOWN_MS, [R])
    expect(g.phase).toBe('running')
    expect(g.startT).toBe(COUNTDOWN_MS)
  })

  it('once started, the countdown runs to GO even if a player leaves position', () => {
    let g = tick(createGame('sprint', 2), 0, [R, R])
    g = tick(g, 1000, [R, OUT])
    expect(g.phase).toBe('countdown')
    expect(g.countdownStart).toBe(0)
    g = tick(g, COUNTDOWN_MS, [R, OUT])
    expect(g.phase).toBe('running')
  })

  it('reps before the start do not count', () => {
    const g = addRep(createGame('sprint', 1), 0, rep(), 0)
    expect(g.players[0].results).toHaveLength(0)
  })
})

describe('timed modes', () => {
  /** Runs a player who does a rep every `every` ms (so they never fail) from t0 to t1. */
  const keepGoing = (g: GameState, t0: number, t1: number, every = 2000) => {
    for (let t = t0; t <= t1; t += 100) {
      if ((t - t0) % every === 0 && t > t0) g = addRep(g, 0, rep(), t)
      g = tick(g, t, [R])
    }
    return g
  }

  it('sprint ends after exactly 30 s and counts reps in between', () => {
    let g = tick(tick(createGame('sprint', 1), 0, [R]), COUNTDOWN_MS, [R])
    g = keepGoing(g, 3100, 32_900)
    expect(g.phase).toBe('running')
    expect(formatClock(clock(g, 32_900))).toBe('0:01')
    g = tick(g, 33_000, [R])
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('time')
    const n = g.players[0].results.length
    expect(n).toBeGreaterThan(10)
    expect(addRep(g, 0, rep(), 33_100).players[0].results).toHaveLength(n) // after the buzzer: ignored
  })

  it('sprint: getting up ends that player’s round early', () => {
    let g = tick(tick(createGame('sprint', 1), 0, [R]), COUNTDOWN_MS, [R])
    g = keepGoing(g, 3100, 10_000)
    g = run(g, 10_100, 10_100 + FAILURE.outOfPositionMs, [OUT])
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('left')
    expect(g.endT).toBeLessThan(13_000)
  })

  it('marathon: stopping (no push-up within the window) ends the round early', () => {
    let g = tick(tick(createGame('marathon', 1), 0, [R]), COUNTDOWN_MS, [R])
    g = keepGoing(g, 3100, 20_000)
    const reps = g.players[0].results.length
    g = run(g, 20_100, 20_000 + failWindow('marathon', reps) + 100, [R])
    expect(g.players[0].finished).toBe('stopped')
  })
})

describe('failure window grows with fatigue', () => {
  it('starts at 4 s and grows 0.25 s per rep', () => {
    expect(failWindow('max', 0)).toBe(4000)
    expect(failWindow('max', 8)).toBe(6000)
    expect(failWindow('max', 16)).toBe(8000)
  })

  it('caps at 10 s in Max, 8 s in Marathon, 6 s in Sprint', () => {
    expect(failWindow('max', 24)).toBe(10_000)
    expect(failWindow('max', 200)).toBe(10_000)
    expect(failWindow('marathon', 200)).toBe(8000)
    expect(failWindow('sprint', 200)).toBe(6000)
  })

  it('a slow pause that would fail early in the set is fine later on', () => {
    // 7 s without a rep: fails at 0 reps (4 s window), survives after 20 reps (9 s window).
    const pause = (repsDone: number) => {
      let g = tick(tick(createGame('max', 1), 0, [R]), COUNTDOWN_MS, [R])
      for (let k = 1; k <= repsDone; k++) g = addRep(g, 0, rep(), COUNTDOWN_MS + k * 500)
      const t0 = COUNTDOWN_MS + repsDone * 500
      return run(g, t0 + 100, t0 + 7000, [R])
    }
    expect(pause(0).players[0].finished).toBe('stopped')
    expect(pause(20).players[0].finished).toBeNull()
  })

  it('stuck in a rep: the same growing window', () => {
    let g = tick(tick(createGame('max', 1), 0, [R]), COUNTDOWN_MS, [R])
    for (let k = 1; k <= 24; k++) g = addRep(g, 0, rep(), COUNTDOWN_MS + k * 500)
    const t0 = COUNTDOWN_MS + 24 * 500
    g = run(g, t0 + 100, t0 + 9500, [{ ready: true, inRep: true }])
    expect(g.players[0].finished).toBeNull() // 10 s window after 24 reps
    g = run(g, t0 + 9600, t0 + 10_300, [{ ready: true, inRep: true }])
    expect(g.players[0].finished).toBe('stuck')
  })

  it('failLeft counts down towards failing', () => {
    let g = tick(tick(createGame('max', 1), 0, [R]), COUNTDOWN_MS, [R])
    expect(failLeft(g, 0, COUNTDOWN_MS + 1000, false)).toBe(3000)
    g = addRep(g, 0, rep(), COUNTDOWN_MS + 1000)
    expect(failLeft(g, 0, COUNTDOWN_MS + 1000, false)).toBe(4250)
  })
})

describe('max', () => {
  const start = (players: 1 | 2 = 1) => {
    const live = Array(players).fill(R)
    return tick(tick(createGame('max', players), 0, live), COUNTDOWN_MS, live)
  }

  it('ends when the player gets up', () => {
    let g = run(start(), 3100, 5000, [R])
    g = run(g, 5100, 5100 + FAILURE.outOfPositionMs, [OUT])
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('left')
  })

  it('a short tracking blip out of position does not end it', () => {
    let g = run(start(), 3100, 4000, [OUT])
    g = run(g, 4100, 6000, [R])
    g = addRep(g, 0, rep(), 6000)
    g = run(g, 6100, 9000, [R])
    expect(g.phase).toBe('running')
  })

  it('co-op: each player ends on their own; the round ends when both have', () => {
    let g = start(2)
    g = run(g, 3100, 3100 + FAILURE.outOfPositionMs + 100, [OUT, R])
    expect(g.players[0].finished).toBe('left')
    expect(g.phase).toBe('running')
    g = addRep(g, 0, rep(), 5500)
    expect(g.players[0].results).toHaveLength(0) // finished players score no more
    g = run(g, 5300, 5300 + failWindow('max', 0), [OUT, R])
    expect(g.phase).toBe('finished')
    expect(formatClock(clock(g, 99_999), false)).toMatch(/^0:\d\d$/)
  })
})

describe('stop and winner', () => {
  it('stop ends the round for everyone', () => {
    const g = endGame(tick(createGame('max', 2), 0, [R, R]), 1000)
    expect(g.phase).toBe('finished')
    expect(g.players.every((p) => p.finished === 'ended')).toBe(true)
  })

  it('points: 2 for a perfect rep, 1 for a 2-light rep, 0 for a no-rep', () => {
    expect([repPoints({ counted: true, perfect: true }), repPoints({ counted: true, perfect: false }), repPoints({ counted: false, perfect: false })]).toEqual([2, 1, 0])
    let g = tick(tick(createGame('sprint', 1), 0, [R]), COUNTDOWN_MS, [R])
    g = addRep(g, 0, rep(), 4000)
    g = addRep(g, 0, rep(true, false), 5000)
    expect(points(g.players[0])).toBe(3)
  })

  it('streak: 5 perfect in a row unlock 1.2x, +0.1x every 5 more, capped at 1.5x', () => {
    expect([0, 4, 5, 9, 10, 15, 20, 40].map(streakMultiplier)).toEqual([1, 1, 1.2, 1.2, 1.3, 1.4, 1.5, 1.5])
    const P = { counted: true, perfect: true }
    const G = { counted: true, perfect: false }
    expect(score(Array(6).fill(P)).points).toBe(12.2) // 5 × 2 + 2.2
    expect(score(Array(11).fill(P)).points).toBe(10 + 5 * 2.2 + 2.3)
    const broken = score([...Array(7).fill(P), G, P])
    expect(broken).toEqual({ points: 10 + 2 * 2.2 + 1 + 2, streak: 1, multiplier: 1, bestStreak: 7 })
    expect(score(Array(30).fill(P)).multiplier).toBe(1.5)
    expect([0, 4, 5, 10, 15, 20, 99].map(streakTier)).toEqual([0, 0, 1, 2, 3, 4, 4])
    expect([12, 12.2, 2.2 + 4.4, 0].map(fmtPoints)).toEqual(['12', '12.2', '6.6', '0'])
  })

  it('winner: most points, then most perfect; ties are null', () => {
    let g = tick(tick(createGame('sprint', 2), 0, [R, R]), COUNTDOWN_MS, [R, R])
    g = addRep(g, 0, rep(), 4000)
    g = addRep(g, 1, rep(true, false), 4000)
    expect(winner(g)).toBe(0) // 2 points (perfect) beats 1
    g = addRep(g, 1, rep(), 5000)
    expect(winner(g)).toBe(1)
    g = addRep(g, 0, rep(true, false), 6000)
    expect(winner(g)).toBeNull()
    expect(winner(createGame('sprint', 1))).toBeNull()
  })
})
