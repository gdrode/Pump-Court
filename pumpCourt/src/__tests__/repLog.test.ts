import { describe, it, expect } from 'vitest'
import { analyse, findExtrema, verdict, DEFAULT_ANALYSIS, type Analysis, type FrameRecord, type RepBottom } from '../repLog'
import { synthLog, type SynthOptions } from './synth'

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const clearCounts = (o: SynthOptions, n = 10) => seeds(n).map((seed) => analyse(synthLog({ ...o, seed })).clearCount)

describe('findExtrema', () => {
  const T = (n: number) => Array.from({ length: n }, (_, i) => i * 10)

  it('finds alternating min/max with enough swing', () => {
    const v = [160, 120, 80, 120, 160, 120, 80, 120, 160]
    const e = findExtrema(T(v.length), v, 30)
    expect(e.map((x) => [x.kind, x.index, x.value])).toEqual([
      ['min', 2, 80],
      ['max', 4, 160],
      ['min', 6, 80],
    ])
    expect(e[0].t).toBe(20)
  })

  it('ignores swings smaller than prominence', () => {
    const v = [160, 140, 155, 135, 150, 140, 160]
    expect(findExtrema(T(v.length), v, 30)).toEqual([])
  })

  it('a turn counts only once the signal comes back by prominence', () => {
    expect(findExtrema(T(4), [160, 80, 100, 109], 30)).toEqual([]) // rose 29
    expect(findExtrema(T(4), [160, 80, 100, 110], 30).map((e) => e.index)).toEqual([1]) // rose 30
  })

  it('does not report the first turn (no direction yet)', () => {
    // Starts at a bottom, rises, falls, rises: only the max and the second min.
    const v = [80, 120, 160, 120, 80, 120, 160]
    expect(findExtrema(T(v.length), v, 30).map((e) => `${e.kind}@${e.index}`)).toEqual(['max@2', 'min@4'])
  })

  it('skips null and non-finite samples', () => {
    const v = [160, null, 80, NaN, Infinity, 120, 160, null]
    expect(findExtrema(T(v.length), v, 30).map((e) => `${e.kind}@${e.index}`)).toEqual(['min@2'])
  })

  it('jitter on top of a big swing does not create extra extrema', () => {
    const v = [160, 158, 162, 120, 82, 79, 81, 78, 83, 120, 161, 159, 163, 120, 80]
    const e = findExtrema(T(v.length), v, 30)
    expect(e.map((x) => `${x.kind}@${x.index}`)).toEqual(['min@7', 'max@12'])
  })

  it('empty / all-null input', () => {
    expect(findExtrema([], [], 30)).toEqual([])
    expect(findExtrema(T(3), [null, null, null], 30)).toEqual([])
  })
})

describe('analyse: clean synthetic logs', () => {
  for (const fps of [60, 30, 15]) {
    for (const repS of [0.5, 1.5]) {
      it(`10 reps @ ${fps} fps, ${repS} s/rep -> 10 clear bottoms`, () => {
        const frames = synthLog({ reps: 10, fps, repS })
        const a = analyse(frames)
        expect(a.bottoms).toHaveLength(10)
        expect(a.clearCount).toBe(10)
        expect(a.droppedFrames).toBe(0)
        expect(a.fps).toBeCloseTo(fps, 6)
        a.bottoms.forEach((b, i) => {
          expect(b.rep).toBe(i + 1)
          expect(b.reason).toBe('clear')
          // True bottom is at (i + 0.5) reps; sampled bottom within one frame.
          expect(Math.abs(b.elbowT - (i + 0.5) * repS * 1000)).toBeLessThanOrEqual(1000 / fps)
          expect(b.elbowMin).toBeLessThan(75)
          expect(b.shoulderMax).toBeGreaterThan(0.54)
          expect(b.offsetMs).toBeLessThanOrEqual(1000 / fps + 1e-6)
          expect(b.frames).toBeGreaterThanOrEqual(Math.floor(repS * fps))
        })
        expect(verdict(a)).toBe('go')
      })
    }
  }

  it('fps is null for a single-frame log; empty log has no bottoms', () => {
    expect(analyse(synthLog({ durationS: 0 })).fps).toBeNull()
    const a = analyse([])
    expect(a).toEqual({ bottoms: [], clearCount: 0, fps: null, droppedFrames: 0 })
    expect(verdict(a)).toBe('no-go')
  })
})

describe('analyse: stress', () => {
  it('gaussian jitter (sigma 1.5 deg, ~±3 deg): GO for every seed at 60/30 fps (0.5 and 1.5 s/rep) and 15 fps (0.5 s/rep)', () => {
    const cells: [number, number][] = [[60, 0.5], [60, 1.5], [30, 0.5], [30, 1.5], [15, 0.5]]
    for (const [fps, repS] of cells) {
      const counts = clearCounts({ fps, repS, elbowNoise: 1.5, shoulderNoise: 0.0015 })
      expect(Math.min(...counts), `fps=${fps} repS=${repS} counts=${counts}`).toBeGreaterThanOrEqual(9)
    }
  })

  it('15 fps at a normal 1.5 s/rep with the same jitter is GO for every seed (bottom timed as band centre)', () => {
    const counts = clearCounts({ fps: 15, repS: 1.5, elbowNoise: 1.5, shoulderNoise: 0.0015 }, 20)
    expect(Math.min(...counts), `counts=${counts}`).toBeGreaterThanOrEqual(9)
  })

  it('heavier jitter (sigma 3 deg) is still fine for fast reps (0.5 s) at 60/30/15 fps', () => {
    for (const fps of [60, 30, 15]) {
      const counts = clearCounts({ fps, repS: 0.5, elbowNoise: 3, shoulderNoise: 0.003 })
      expect(counts.every((c) => c === 10), `fps=${fps} counts=${counts}`).toBe(true)
    }
  })

  it('slow reps (3 s) + sigma 3 deg jitter stay in sync at 30 and 60 fps', () => {
    for (const fps of [30, 60]) {
      const runs = seeds(20).map((seed) => analyse(synthLog({ fps, repS: 3, elbowNoise: 3, shoulderNoise: 0.003, seed })))
      runs.forEach((a) => expect(a.bottoms).toHaveLength(10))
      expect(runs.filter((a) => verdict(a) === 'go').length, `fps=${fps}`).toBe(20)
    }
  })

  it('a run of hidden frames over a top does not merge two bottoms into one timing', () => {
    // seed 10: four low-visibility frames hide the top between reps 7 and 8.
    const a = analyse(synthLog({ fps: 15, repS: 0.5, elbowNoise: 3, shoulderNoise: 0.003, dropRate: 0.1, lowVisRate: 0.05, seed: 10 }))
    a.bottoms.forEach((b) => expect(b.clear, `rep ${b.rep}: ${b.reason}`).toBe(true))
  })

  it('dropped frames (null records) are skipped and counted', () => {
    const frames = synthLog({ fps: 30, repS: 1.5, dropRate: 0.1, seed: 3 })
    const nulls = frames.filter((f) => f.elbow == null).length
    expect(nulls).toBeGreaterThan(20)
    const a = analyse(frames)
    expect(a.droppedFrames).toBe(nulls)
    expect(a.bottoms).toHaveLength(10)
    expect(a.clearCount).toBeGreaterThanOrEqual(9)
    expect(a.fps).toBeCloseTo(30, 6) // fps counts all records, including dropped
  })

  it('low-visibility frames are ignored even when they carry garbage values', () => {
    const frames = synthLog({ fps: 30, repS: 1.5, lowVisRate: 0.15, seed: 5 }).map((f) =>
      f.visibility != null && f.visibility < 0.5 ? { ...f, elbow: 5, shoulderY: 0.95 } : f,
    )
    const low = frames.filter((f) => f.visibility != null && f.visibility < 0.5).length
    expect(low).toBeGreaterThan(30)
    const a = analyse(frames)
    expect(a.droppedFrames).toBe(low)
    expect(a.bottoms).toHaveLength(10)
    expect(a.clearCount).toBe(10)
    a.bottoms.forEach((b) => expect(b.elbowMin).toBeGreaterThan(60))
  })

  it('frames with null visibility are treated as not ok', () => {
    const frames = synthLog({ fps: 30, repS: 1.5 }).map((f) => ({ ...f, visibility: null }))
    const a = analyse(frames)
    expect(a.bottoms).toHaveLength(0)
    expect(a.droppedFrames).toBe(frames.length)
  })

  it('minVisibility option is honoured', () => {
    const frames = synthLog({ fps: 30, repS: 1.5, lowVisRate: 1 }) // every frame at 0.2
    expect(analyse(frames).bottoms).toHaveLength(0)
    expect(analyse(frames, { ...DEFAULT_ANALYSIS, minVisibility: 0.1 }).clearCount).toBe(10)
  })

  it('shoulder bottom lagging the elbow by > syncWindowMs is not clear', () => {
    for (const fps of [60, 30]) {
      const a = analyse(synthLog({ fps, repS: 1.5, shoulderLagMs: 200 }))
      expect(a.bottoms).toHaveLength(10)
      expect(a.clearCount).toBe(0)
      a.bottoms.forEach((b) => {
        expect(b.clear).toBe(false)
        expect(Math.abs(b.offsetMs! - 200)).toBeLessThanOrEqual(1000 / fps + 1e-6)
        expect(b.reason).toMatch(/^out of sync by \d+ ms$/)
      })
      expect(verdict(a)).toBe('no-go')
    }
  })

  it('a lag inside the window is still clear', () => {
    const a = analyse(synthLog({ fps: 60, repS: 1.5, shoulderLagMs: 100 }))
    expect(a.clearCount).toBe(10)
  })

  it('syncWindowMs option is honoured', () => {
    const frames = synthLog({ fps: 60, repS: 1.5, shoulderLagMs: 200 })
    expect(analyse(frames, { ...DEFAULT_ANALYSIS, syncWindowMs: 250 }).clearCount).toBe(10)
  })

  it('a rep with no shoulder movement has no shoulder bottom', () => {
    const a = analyse(synthLog({ fps: 30, repS: 1.5, frozenShoulderReps: [4] }))
    expect(a.bottoms).toHaveLength(10)
    const b = a.bottoms[4]
    expect(b.clear).toBe(false)
    expect(b.shoulderT).toBeNull()
    expect(b.shoulderMax).toBeNull()
    expect(b.offsetMs).toBeNull()
    expect(b.reason).toBe('no shoulder bottom')
    expect(a.clearCount).toBe(9)
    expect(verdict(a)).toBe('go')

    const two = analyse(synthLog({ fps: 30, repS: 1.5, frozenShoulderReps: [2, 7] }))
    expect(two.clearCount).toBe(8)
    expect(verdict(two)).toBe('no-go')
  })

  it('log starting mid-rep at the bottom: that half-rep is not counted', () => {
    const repS = 1.5
    // Starts at a bottom, then 10 full reps, ends at top.
    const a = analyse(synthLog({ fps: 30, repS, startPhase: 0.5, durationS: 10.5 * repS }))
    expect(a.bottoms).toHaveLength(10)
    expect(a.clearCount).toBe(10)
    // First counted bottom is one rep after the start, not at t=0.
    expect(a.bottoms[0].elbowT).toBeCloseTo(repS * 1000, -2)
  })

  it('log ending at the bottom: the final bottom is not counted (no rise after it)', () => {
    const repS = 1.5
    const endsAtBottom = analyse(synthLog({ fps: 30, repS, durationS: 9.5 * repS }))
    expect(endsAtBottom.bottoms).toHaveLength(9)
    expect(verdict(endsAtBottom)).toBe('no-go')
    // Once the elbow has re-opened by >= elbowProminence (30 deg), it counts.
    const risen = analyse(synthLog({ fps: 30, repS, durationS: 9.75 * repS }))
    expect(risen.bottoms).toHaveLength(10)
    expect(risen.clearCount).toBe(10)
  })

  it('a rep that never bends (elbow stays near the top) is not a bottom', () => {
    const frames = synthLog({ fps: 30, repS: 1.5 })
    // Flatten rep 3 (frames in [3, 4) reps) to 160 deg.
    const flat = frames.map((f) => (f.t >= 4500 && f.t < 6000 ? { ...f, elbow: 160, shoulderY: 0.45 } : f))
    const a = analyse(flat)
    expect(a.bottoms).toHaveLength(9)
  })
})

describe('frame-rate / speed limits (0.5 s/rep = flat-out)', () => {
  it('0.5 s/rep with sigma 3 deg jitter is GO at 15, 10 and 8 fps', () => {
    for (const fps of [15, 10, 8]) {
      const counts = clearCounts({ fps, repS: 0.5, elbowNoise: 3, shoulderNoise: 0.003 })
      expect(Math.min(...counts), `fps=${fps}`).toBeGreaterThanOrEqual(9)
    }
  })

  it('0.5 s/rep @ 15 fps survives 10% drops + 5% low-vis + jitter', () => {
    const counts = clearCounts({ fps: 15, repS: 0.5, elbowNoise: 3, shoulderNoise: 0.003, dropRate: 0.1, lowVisRate: 0.05 })
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(9)
  })

  it('6 fps still finds sharp bottoms: the sync window widens to 1.5 frame periods', () => {
    const counts = clearCounts({ fps: 6, repS: 0.5, elbowNoise: 3, shoulderNoise: 0.003 })
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(9)
  })

  it('aliasing: under ~2 frames per rep, bottoms are lost entirely', () => {
    expect(analyse(synthLog({ fps: 6, repS: 0.25 })).bottoms.length).toBeLessThan(10)
    expect(analyse(synthLog({ fps: 4, repS: 0.25 })).bottoms.length).toBe(0)
  })
})

describe('verdict', () => {
  const mk = (n: number, clear: number): Analysis => {
    const bottoms: RepBottom[] = Array.from({ length: n }, (_, i) => ({
      rep: i + 1, elbowT: i * 1000, elbowMin: 70, shoulderT: i * 1000, shoulderMax: 0.55,
      offsetMs: 0, frames: 30, clear: i < clear, reason: i < clear ? 'clear' : 'no shoulder bottom',
    }))
    return { bottoms, clearCount: clear, fps: 30, droppedFrames: 0 }
  }

  it('GO at 10/10 and 9/10', () => {
    expect(verdict(mk(10, 10))).toBe('go')
    expect(verdict(mk(10, 9))).toBe('go')
  })

  it('NO-GO at 8/10', () => {
    expect(verdict(mk(10, 8))).toBe('no-go')
  })

  it('NO-GO with fewer than 10 reps even if all clear', () => {
    expect(verdict(mk(9, 9))).toBe('no-go')
    expect(analyse(synthLog({ reps: 9, fps: 30, repS: 1.5 })).clearCount).toBe(9)
    expect(verdict(analyse(synthLog({ reps: 9, fps: 30, repS: 1.5 })))).toBe('no-go')
  })

  it('custom target / needed', () => {
    expect(verdict(mk(5, 5), 5, 5)).toBe('go')
    expect(verdict(mk(5, 4), 5, 5)).toBe('no-go')
  })

  it('judges only the first 10 reps: 9 clear out of 20 is GO only if they are among the first 10', () => {
    expect(verdict(mk(20, 9))).toBe('go')
    const late = mk(20, 0)
    late.bottoms.forEach((b, i) => { b.clear = i >= 11 })
    late.clearCount = 9
    expect(verdict(late)).toBe('no-go')
  })
})

describe('NaN angles (coincident landmarks)', () => {
  const nanFrames = (): FrameRecord[] =>
    synthLog({ fps: 30, repS: 1.5 }).map((f, i) => (i % 10 === 5 ? { ...f, elbow: NaN } : f))

  it('NaN elbow (computeAngles on coincident landmarks) should count as a dropped frame', () => {
    const frames = nanFrames()
    const nan = frames.filter((f) => Number.isNaN(f.elbow)).length
    expect(analyse(frames).droppedFrames).toBe(nan)
  })

  it('NaN elbow should not be counted in RepBottom.frames', () => {
    const clean = analyse(synthLog({ fps: 30, repS: 1.5 }))
    const withNaN = analyse(nanFrames())
    expect(withNaN.bottoms[3].frames).toBeLessThan(clean.bottoms[3].frames)
  })
})
