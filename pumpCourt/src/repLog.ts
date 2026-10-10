// Plain TypeScript: the per-frame log for the fast-rep test and the analysis
// that finds rep bottoms. No camera code; it runs the same on a saved JSON log.

export interface FrameRecord {
  /** ms since the log started */
  t: number
  /** null when no pose was found on this frame */
  elbow: number | null
  shoulderY: number | null
  hipAngle: number | null
  kneeAngle: number | null
  visibility: number | null
}

export interface RepLogFile {
  version: 1
  createdAt: string
  camera: string
  requestedFps: number
  deliveredFps: number | null
  model: string
  side: string
  frames: FrameRecord[]
}

export interface Extremum {
  index: number
  t: number
  value: number
  kind: 'min' | 'max'
}

/**
 * Alternating minima and maxima whose swing is at least `prominence`.
 * Hysteresis, no smoothing: a turn only counts once the signal has moved back
 * by `prominence`, so frame-to-frame jitter is ignored but sharp peaks are kept.
 */
export function findExtrema(t: number[], v: (number | null)[], prominence: number): Extremum[] {
  const out: Extremum[] = []
  let dir: 'up' | 'down' | null = null
  let hi = -1, lo = -1
  for (let i = 0; i < v.length; i++) {
    const x = v[i]
    if (x == null || !Number.isFinite(x)) continue
    if (hi < 0) { hi = lo = i; continue }
    if (x > (v[hi] as number)) hi = i
    if (x < (v[lo] as number)) lo = i
    if (dir !== 'up' && x >= (v[lo] as number) + prominence) {
      if (dir === 'down') out.push({ index: lo, t: t[lo], value: v[lo] as number, kind: 'min' })
      dir = 'up'; hi = i
    } else if (dir !== 'down' && x <= (v[hi] as number) - prominence) {
      if (dir === 'up') out.push({ index: hi, t: t[hi], value: v[hi] as number, kind: 'max' })
      dir = 'down'; lo = i
    }
  }
  return out
}

export interface AnalysisOptions {
  /** Degrees the elbow must open again before a bottom counts. */
  elbowProminence: number
  /** Shoulder drop (fraction of frame height) that counts as a rep. */
  shoulderProminence: number
  /** Max ms between the elbow bottom and the shoulder bottom. Never less than 1.5 frame periods. */
  syncWindowMs: number
  /** Frames within this many degrees of the elbow minimum count as the bottom; its time is their centre. */
  elbowBottomTol: number
  /** Same for shoulder height, in fraction of frame height. */
  shoulderBottomTol: number
  /** Ignore frames whose visibility is below this. */
  minVisibility: number
}

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  elbowProminence: 30,
  shoulderProminence: 0.03,
  syncWindowMs: 120,
  elbowBottomTol: 6,
  shoulderBottomTol: 0.006,
  minVisibility: 0.5,
}

export interface RepBottom {
  rep: number
  elbowT: number
  elbowMin: number
  /** null when no shoulder bottom was found in this rep's window */
  shoulderT: number | null
  shoulderMax: number | null
  /** |elbowT - shoulderT| */
  offsetMs: number | null
  /** frames with a valid pose between the surrounding elbow peaks */
  frames: number
  clear: boolean
  reason: string
}

export interface Analysis {
  bottoms: RepBottom[]
  clearCount: number
  fps: number | null
  droppedFrames: number
}

export function analyse(frames: FrameRecord[], opts: AnalysisOptions = DEFAULT_ANALYSIS): Analysis {
  const ok = (f: FrameRecord) =>
    Number.isFinite(f.elbow ?? NaN) && Number.isFinite(f.shoulderY ?? NaN) && (f.visibility ?? 0) >= opts.minVisibility
  const t = frames.map((f) => f.t)
  const elbow = frames.map((f) => (ok(f) ? f.elbow : null))
  const shoulder = frames.map((f) => (ok(f) ? f.shoulderY : null))

  const elbowExt = findExtrema(t, elbow, opts.elbowProminence)
  const shoulderBottoms = findExtrema(t, shoulder, opts.shoulderProminence).filter((e) => e.kind === 'max')

  const period = medianFramePeriod(t)
  const window = Math.max(opts.syncWindowMs, period * 1.5)

  // A slow rep has a wide, flat bottom where the single lowest frame wanders
  // with noise, so time the bottom as the centre of the frames near the extreme.
  // Only frames in this rep's window count, and the window is cut at any gap of
  // missing frames, so a hidden top can never merge two bottoms into one.
  const maxGap = Math.max(period * 2.5, 1)
  const centre = (v: (number | null)[], at: number, from: number, to: number, tol: number, low: boolean) => {
    const near = (x: number) => (low ? x <= v[at]! + tol : x >= v[at]! - tol)
    let sum = t[at], n = 1
    for (const step of [-1, 1]) {
      let last = t[at]
      for (let i = at + step; i >= from && i <= to; i += step) {
        const x = v[i]
        if (x == null) continue
        if (Math.abs(t[i] - last) > maxGap) break
        last = t[i]
        if (near(x)) { sum += t[i]; n++ }
      }
    }
    return sum / n
  }

  const bottoms: RepBottom[] = []
  elbowExt.forEach((e, k) => {
    if (e.kind !== 'min') return
    // This rep runs between the elbow peaks either side of the bottom.
    const from = k > 0 ? elbowExt[k - 1].index : 0
    const to = k < elbowExt.length - 1 ? elbowExt[k + 1].index : frames.length - 1
    const nFrames = elbow.slice(from, to + 1).filter((x) => x != null).length
    const elbowT = centre(elbow, e.index, from, to, opts.elbowBottomTol, true)
    const inRep = shoulderBottoms.filter((s) => s.index >= from && s.index <= to)
    const s = inRep.sort((a, b) => Math.abs(a.t - e.t) - Math.abs(b.t - e.t))[0]
    const shoulderT = s ? centre(shoulder, s.index, from, to, opts.shoulderBottomTol, false) : null
    const offset = shoulderT != null ? Math.abs(shoulderT - elbowT) : null
    const clear = offset != null && offset <= window
    bottoms.push({
      rep: bottoms.length + 1,
      elbowT,
      elbowMin: e.value,
      shoulderT,
      shoulderMax: s?.value ?? null,
      offsetMs: offset,
      frames: nFrames,
      clear,
      reason: s == null ? 'no shoulder bottom' : clear ? 'clear' : `out of sync by ${Math.round(offset!)} ms`,
    })
  })

  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0
  return {
    bottoms,
    clearCount: bottoms.filter((b) => b.clear).length,
    fps: span > 0 ? ((frames.length - 1) * 1000) / span : null,
    droppedFrames: frames.filter((f) => !ok(f)).length,
  }
}

function medianFramePeriod(t: number[]) {
  const d = t.slice(1).map((x, i) => x - t[i]).filter((x) => x > 0).sort((a, b) => a - b)
  return d.length ? d[Math.floor(d.length / 2)] : 0
}

/** Suggested threshold from the instructions: at least 9 of the first 10 reps show a clear bottom. */
export function verdict(a: Analysis, target = 10, needed = 9): 'go' | 'no-go' {
  if (a.bottoms.length < target) return 'no-go'
  return a.bottoms.slice(0, target).filter((b) => b.clear).length >= needed ? 'go' : 'no-go'
}
