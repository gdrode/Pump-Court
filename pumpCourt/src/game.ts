// Plain TypeScript: the game rules around the referee. Modes, the wait for
// every player to get into position, the 3-2-1 countdown, the clock, and when
// a Max round ends. No camera or React code; App.tsx feeds it the time, who is
// in position and each judge's results.
import type { RepResult } from './judge'

export type Mode = 'sprint' | 'marathon' | 'max'
export type Players = 1 | 2

export const MODES: Record<Mode, { label: string; durationMs: number | null; blurb: string }> = {
  sprint: { label: 'Sprint', durationMs: 30_000, blurb: '30 seconds. Most good push-ups wins.' },
  marathon: { label: 'Marathon', durationMs: 60_000, blurb: '60 seconds. Most good push-ups wins.' },
  max: { label: 'Max', durationMs: null, blurb: 'No time limit. Ends when you can’t keep going or get up.' },
}

/** The 3-2-1 before the clock starts. */
export const COUNTDOWN_MS = 3000

/**
 * When a player fails, in every mode. A player's round ends early if they get
 * up, get stuck in a rep (can't press up), or stop doing push-ups. The window
 * for "stuck" and "stopped" grows with every rep done, because people slow
 * down as they tire but can still keep going.
 */
export const FAILURE = {
  /** Out of the push-up position (stood up, knees down, walked off) this long. Not fatigue-based. */
  outOfPositionMs: 2000,
  /** Failure window at the first rep. */
  baseMs: 4000,
  /** Added to the window for each rep attempted. */
  perRepMs: 250,
  /** The window never grows past this, per mode. Max reaches 10 s after 24 reps. */
  capMs: { sprint: 6000, marathon: 8000, max: 10_000 } as Record<Mode, number>,
}

/** How long a player may be stuck in a rep, or go without one, before they've failed. */
export function failWindow(mode: Mode, repsDone: number) {
  return Math.min(FAILURE.capMs[mode], FAILURE.baseMs + FAILURE.perRepMs * repsDone)
}

export type Phase = 'waiting' | 'countdown' | 'running' | 'finished'

export type FinishReason = 'time' | 'stopped' | 'stuck' | 'left' | 'ended'

export const FINISH_TEXT: Record<FinishReason, string> = {
  time: 'Time!',
  stopped: 'Stopped: no push-up in time',
  stuck: 'Couldn’t press back up',
  left: 'Got up out of position',
  ended: 'Ended by the operator',
}

export interface PlayerState {
  results: RepResult[]
  finished: FinishReason | null
  finishedAt: number | null
  /** Time of the last rep (counted or not), or the round start. */
  lastRepT: number
  outSince: number | null
  stuckSince: number | null
}

export interface GameState {
  mode: Mode
  phase: Phase
  players: PlayerState[]
  countdownStart: number | null
  startT: number | null
  endT: number | null
}

/** What the game needs to know about a player on each tick. */
export interface PlayerLive {
  /** In the push-up position (posture.ts). */
  ready: boolean
  /** The judge is partway through a rep ('down', 'up' or 'turning'). */
  inRep: boolean
}

export function createGame(mode: Mode, players: Players): GameState {
  return {
    mode,
    phase: 'waiting',
    players: Array.from({ length: players }, () => ({ results: [], finished: null, finishedAt: null, lastRepT: 0, outSince: null, stuckSince: null })),
    countdownStart: null,
    startT: null,
    endT: null,
  }
}

const finishAll = (g: GameState, now: number, reason: FinishReason): GameState => ({
  ...g,
  phase: 'finished',
  endT: now,
  players: g.players.map((p) => (p.finished ? p : { ...p, finished: reason, finishedAt: now })),
})

/** Advances the game to `now`. Call several times a second. */
export function tick(g: GameState, now: number, live: PlayerLive[]): GameState {
  switch (g.phase) {
    case 'waiting':
      // Everyone must be in position before the countdown starts.
      return live.length >= g.players.length && live.every((l) => l.ready) ? { ...g, phase: 'countdown', countdownStart: now } : g

    case 'countdown':
      // Someone left position during the 3-2-1: wait for them again.
      if (!live.every((l) => l.ready)) return { ...g, phase: 'waiting', countdownStart: null }
      if (now - g.countdownStart! < COUNTDOWN_MS) return g
      return { ...g, phase: 'running', startT: now, players: g.players.map((p) => ({ ...p, lastRepT: now })) }

    case 'running': {
      const duration = MODES[g.mode].durationMs
      if (duration != null && now - g.startT! >= duration) return finishAll(g, g.startT! + duration, 'time')
      // Every mode: each player can fail on their own; the round ends early when all have.
      const players = g.players.map((p, i): PlayerState => {
        if (p.finished) return p
        const l = live[i] ?? { ready: false, inRep: false }
        const outSince = l.ready ? null : p.outSince ?? now
        const stuckSince = l.ready && l.inRep ? p.stuckSince ?? now : null
        const window = failWindow(g.mode, p.results.length)
        const end = (reason: FinishReason): PlayerState => ({ ...p, outSince, stuckSince, finished: reason, finishedAt: now })
        if (outSince != null && now - outSince >= FAILURE.outOfPositionMs) return end('left')
        if (stuckSince != null && now - stuckSince >= window) return end('stuck')
        if (l.ready && !l.inRep && now - p.lastRepT >= window) return end('stopped')
        return { ...p, outSince, stuckSince }
      })
      const next = { ...g, players }
      return players.every((p) => p.finished) ? { ...next, phase: 'finished', endT: now } : next
    }

    case 'finished':
      return g
  }
}

/**
 * How close a running player is to failing: ms left before "stuck" or
 * "stopped" ends their round, or null when they're not at risk (or not playing).
 */
export function failLeft(g: GameState, player: number, now: number, inRep: boolean): number | null {
  const p = g.players[player]
  if (g.phase !== 'running' || !p || p.finished) return null
  const window = failWindow(g.mode, p.results.length)
  const since = inRep ? p.stuckSince : p.lastRepT
  return since == null ? null : Math.max(0, window - (now - since))
}

/** Records a rep for a player. Ignored unless the round is running and that player is still in it. */
export function addRep(g: GameState, player: number, rep: RepResult, now: number): GameState {
  const p = g.players[player]
  if (g.phase !== 'running' || !p || p.finished) return g
  const players = g.players.slice()
  players[player] = { ...p, results: [...p.results, rep], lastRepT: now, stuckSince: null }
  return { ...g, players }
}

/** The operator pressed Stop. */
export function endGame(g: GameState, now: number): GameState {
  return g.phase === 'finished' ? g : finishAll(g, now, 'ended')
}

/** Whole seconds left in the 3-2-1 (3, 2, 1), or 0 when not counting down. */
export function countdownLeft(g: GameState, now: number) {
  return g.phase === 'countdown' ? Math.max(1, Math.ceil((COUNTDOWN_MS - (now - g.countdownStart!)) / 1000)) : 0
}

/** Clock to show: time left for timed modes, time elapsed for Max. Milliseconds. */
export function clock(g: GameState, now: number) {
  const duration = MODES[g.mode].durationMs
  if (g.startT == null) return duration ?? 0
  const elapsed = (g.endT ?? now) - g.startT
  return duration != null ? Math.max(0, duration - elapsed) : elapsed
}

export const goodReps = (p: PlayerState) => p.results.filter((r) => r.counted).length

/** Index of the winner in a 2-player round, or null for a tie / 1 player. Ties on good reps go to more perfect reps. */
export function winner(g: GameState): number | null {
  if (g.players.length < 2) return null
  const score = (p: PlayerState) => goodReps(p) * 1000 + p.results.filter((r) => r.perfect).length
  const [a, b] = g.players.map(score)
  return a === b ? null : a > b ? 0 : 1
}

/** m:ss. Countdowns round up (shows 0:01 until the end), elapsed time rounds down. */
export function formatClock(ms: number, roundUp = true) {
  const s = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
