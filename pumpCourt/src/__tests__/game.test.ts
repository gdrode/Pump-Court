import { describe, it, expect } from 'vitest'
import { addRep, clock, COUNTDOWN_MS, countdownLeft, createGame, endGame, formatClock, goodReps, MAX_RULES, tick, winner, type GameState, type PlayerLive } from '../game'
import type { RepResult } from '../judge'

const rep = (counted = true, perfect = counted): RepResult => ({
  rep: 1, startT: 0, endT: 0, lights: { depth: counted, torso: counted, lockout: perfect }, whiteCount: perfect ? 3 : counted ? 2 : 1,
  counted, perfect, measured: { depth: 0.2, bottomElbow: 70, hip: 175, knee: 175, lockout: 170 }, faults: [],
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

  it('a player leaving position during the countdown sends it back to waiting', () => {
    let g = tick(createGame('sprint', 2), 0, [R, R])
    g = tick(g, 1000, [R, OUT])
    expect(g.phase).toBe('waiting')
    expect(g.countdownStart).toBeNull()
  })

  it('reps before the start do not count', () => {
    const g = addRep(createGame('sprint', 1), 0, rep(), 0)
    expect(g.players[0].results).toHaveLength(0)
  })
})

describe('timed modes', () => {
  it('sprint ends after exactly 30 s and counts reps in between', () => {
    let g = tick(tick(createGame('sprint', 1), 0, [R]), COUNTDOWN_MS, [R])
    g = addRep(g, 0, rep(), 5000)
    g = addRep(g, 0, rep(false), 6000)
    g = run(g, 3100, 32_900, [R])
    expect(g.phase).toBe('running')
    expect(formatClock(clock(g, 32_900))).toBe('0:01')
    g = tick(g, 33_000, [R])
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('time')
    expect(goodReps(g.players[0])).toBe(1)
    expect(g.players[0].results).toHaveLength(2)
    expect(addRep(g, 0, rep(), 33_100).players[0].results).toHaveLength(2) // after the buzzer: ignored
  })

  it('marathon lasts 60 s and does not end when a player gets up', () => {
    let g = tick(tick(createGame('marathon', 1), 0, [R]), COUNTDOWN_MS, [R])
    g = run(g, 3100, 62_900, [OUT])
    expect(g.phase).toBe('running')
    g = tick(g, 63_000, [OUT])
    expect(g.phase).toBe('finished')
  })
})

describe('max', () => {
  const start = (players: 1 | 2 = 1) => {
    const live = Array(players).fill(R)
    return tick(tick(createGame('max', players), 0, live), COUNTDOWN_MS, live)
  }

  it('ends when the player gets up', () => {
    let g = run(start(), 3100, 5000, [R])
    g = run(g, 5100, 5100 + MAX_RULES.outOfPositionMs, [OUT])
    expect(g.phase).toBe('finished')
    expect(g.players[0].finished).toBe('left')
  })

  it('a short tracking blip out of position does not end it', () => {
    let g = run(start(), 3100, 4000, [OUT])
    g = run(g, 4100, 9000, [R])
    g = addRep(g, 0, rep(), 9000)
    g = run(g, 9100, 12_000, [R])
    expect(g.phase).toBe('running')
  })

  it('ends when stuck in a rep (can’t press up)', () => {
    const g = run(start(), 3100, 3100 + MAX_RULES.stuckMs + 100, [{ ready: true, inRep: true }])
    expect(g.players[0].finished).toBe('stuck')
  })

  it('ends after 8 s without a rep, and every rep resets that clock', () => {
    let g = start()
    for (let t = 3000; t < 30_000; t += 3000) {
      g = run(g, t + 100, t + 3000, [R])
      g = addRep(g, 0, rep(), t + 3000)
    }
    expect(g.phase).toBe('running')
    g = run(g, 30_100, 30_000 + MAX_RULES.idleMs, [R])
    expect(g.players[0].finished).toBe('stopped')
  })

  it('co-op: each player ends on their own; the round ends when both have', () => {
    let g = start(2)
    g = run(g, 3100, 3100 + MAX_RULES.outOfPositionMs + 100, [OUT, R])
    expect(g.players[0].finished).toBe('left')
    expect(g.phase).toBe('running')
    g = addRep(g, 0, rep(), 6000)
    expect(g.players[0].results).toHaveLength(0) // finished players score no more
    g = run(g, 5300, 5300 + MAX_RULES.idleMs, [OUT, R])
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

  it('winner: most good reps, then most perfect; ties are null', () => {
    let g = tick(tick(createGame('sprint', 2), 0, [R, R]), COUNTDOWN_MS, [R, R])
    g = addRep(g, 0, rep(), 4000)
    g = addRep(g, 1, rep(true, false), 4000)
    expect(winner(g)).toBe(0) // same good reps, player 1 has the perfect one
    g = addRep(g, 1, rep(), 5000)
    expect(winner(g)).toBe(1)
    g = addRep(g, 0, rep(true, false), 6000)
    expect(winner(g)).toBeNull()
    expect(winner(createGame('sprint', 1))).toBeNull()
  })
})
