// Test helpers: deterministic synthetic push-up logs.
import type { FrameRecord } from '../repLog'

/** mulberry32: small seeded PRNG so jitter tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box-Muller. */
export function gaussian(r: () => number) {
  const u = 1 - r()
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface SynthOptions {
  reps?: number
  fps?: number
  /** seconds per rep */
  repS?: number
  elbowTop?: number
  elbowBottom?: number
  shoulderTop?: number
  shoulderBottom?: number
  /** ms the shoulder bottom lags the elbow bottom */
  shoulderLagMs?: number
  /** phase (0..1 of a rep) the log starts at; 0 = top, 0.5 = bottom */
  startPhase?: number
  /** total duration override in seconds (default reps * repS) */
  durationS?: number
  /** stddev of elbow noise in degrees */
  elbowNoise?: number
  /** stddev of shoulderY noise (fraction of frame) */
  shoulderNoise?: number
  /** probability a frame has no pose (null record) */
  dropRate?: number
  /** probability a frame has low visibility (0.2) */
  lowVisRate?: number
  /** reps (0-based) where the shoulder doesn't move */
  frozenShoulderReps?: number[]
  /** timing jitter stddev in ms on each frame's timestamp */
  tJitterMs?: number
  seed?: number
}

/**
 * Elbow follows 1 - cos: top at phase 0, bottom at phase 0.5.
 * shoulderY rises (body lowers) in phase with the elbow closing.
 */
export function synthLog(o: SynthOptions = {}): FrameRecord[] {
  const reps = o.reps ?? 10
  const fps = o.fps ?? 30
  const repMs = (o.repS ?? 1.5) * 1000
  const eTop = o.elbowTop ?? 165, eBot = o.elbowBottom ?? 70
  const sTop = o.shoulderTop ?? 0.45, sBot = o.shoulderBottom ?? 0.55
  const lag = o.shoulderLagMs ?? 0
  const startMs = (o.startPhase ?? 0) * repMs
  const durMs = (o.durationS != null ? o.durationS * 1000 : reps * repMs)
  const r = rng(o.seed ?? 1)
  const frozen = new Set(o.frozenShoulderReps ?? [])
  const dt = 1000 / fps
  const n = Math.floor(durMs / dt + 1e-9) + 1
  const out: FrameRecord[] = []
  for (let i = 0; i < n; i++) {
    const t = i * dt + (o.tJitterMs ? gaussian(r) * o.tJitterMs : 0)
    const tt = startMs + i * dt // true motion time
    const ph = (2 * Math.PI * tt) / repMs
    const closing = (1 - Math.cos(ph)) / 2 // 0 top .. 1 bottom
    const phS = (2 * Math.PI * (tt - lag)) / repMs
    const repIdx = Math.floor((tt - lag) / repMs)
    const closingS = frozen.has(repIdx) ? 0 : (1 - Math.cos(phS)) / 2
    let elbow = eTop + (eBot - eTop) * closing
    let shoulderY = sTop + (sBot - sTop) * closingS
    if (o.elbowNoise) elbow += gaussian(r) * o.elbowNoise
    if (o.shoulderNoise) shoulderY += gaussian(r) * o.shoulderNoise
    const dropped = o.dropRate ? r() < o.dropRate : false
    const lowVis = o.lowVisRate ? r() < o.lowVisRate : false
    out.push(
      dropped
        ? { t, elbow: null, shoulderY: null, hipAngle: null, kneeAngle: null, visibility: null }
        : { t, elbow, shoulderY, hipAngle: 175, kneeAngle: 178, visibility: lowVis ? 0.2 : 0.95 },
    )
  }
  return out
}
