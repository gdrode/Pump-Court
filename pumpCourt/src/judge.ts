// The referee: plain TypeScript, no camera or drawing code. Feed it one frame
// of angles at a time and it returns a result each time a rep finishes.
//
// Three lights, one per rule:
//   depth   - chest to the floor (shoulder close to the hands' height)
//   torso   - body held straight: no sag or pike at the abdomen, knees straight
//   lockout - arms fully straight at the top
// 2 or 3 white lights = the rep counts. 3 = a perfect rep.

export type Light = 'depth' | 'torso' | 'lockout'
export const LIGHTS: Light[] = ['depth', 'torso', 'lockout']
export const LIGHT_LABEL: Record<Light, string> = { depth: 'Depth', torso: 'Torso', lockout: 'Lockout' }

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface Thresholds {
  /** Elbow angle (degrees) the arms must open to at the top. */
  lockoutElbow: number
  /** Used for depth only when the wrists can't be seen: elbow angle (degrees) the rep must bend below. */
  depthElbowFallback: number
  /** Body-line angle (degrees) at the abdominal point the body must stay above. 180 = dead straight. */
  torsoHip: number
  /** Knee angle (degrees) the legs must stay above: catches knee push-ups and bent legs. */
  knee: number
  /** Shoulder height above the hands, in arm lengths, the rep must get below. 0 = chest on the floor. */
  depth: number
}

export const DIFFICULTY: Record<Difficulty, Thresholds & { label: string; blurb: string }> = {
  easy: { label: 'Easy', blurb: 'Elbows to about 90°, small sag allowed', lockoutElbow: 145, torsoHip: 145, knee: 140, depth: 0.55, depthElbowFallback: 95 },
  normal: { label: 'Normal', blurb: 'Chest close to the floor, body mostly straight', lockoutElbow: 155, torsoHip: 155, knee: 150, depth: 0.42, depthElbowFallback: 85 },
  hard: { label: 'Hard', blurb: 'Chest to the floor, rigid plank, full lockout', lockoutElbow: 165, torsoHip: 165, knee: 160, depth: 0.3, depthElbowFallback: 75 },
}

/** The angles the judge needs from one frame. Missing or unreliable frames are passed as null. */
export interface JudgeInput {
  elbow: number
  /** Body-line angle (pose.ts `abdomen`: shoulder–abdomen–knee). */
  hip: number
  depth: number
  /** Knee angle; when given, bent knees fail the Torso light. */
  knee?: number
  /** Abdominal point off the shoulder–ankle line (pose.ts): positive = sagging, negative = piked. Only words the fault. */
  bodyOffset?: number
  /** From posture.ts. When false, no rep starts, and one in progress is dropped if it stays false. Omitted = assume ready. */
  ready?: boolean
  /** Tracked shoulder's height in the frame (0 top .. 1 bottom), used to confirm the body really moved. */
  shoulderY?: number
}

export interface RepResult {
  rep: number
  startT: number
  endT: number
  lights: Record<Light, boolean>
  whiteCount: number
  /** At least 2 of 3 white lights. */
  counted: boolean
  /** All 3 white lights. */
  perfect: boolean
  measured: {
    /** Lowest shoulder height reached, in arm lengths. NaN when the wrists were never visible. */
    depth: number
    /** Lowest elbow angle reached. */
    bottomElbow: number
    /** Body angle, ignoring the worst 10% of frames so one bad frame can't fail a rep. */
    hip: number
    /** Knee angle, measured the same way (NaN when not given). */
    knee: number
    /** Highest elbow angle reached on the way up. */
    lockout: number
  }
  /** Why each red light was given, in plain words. */
  faults: string[]
}

/** Rep segmentation constants (degrees of elbow movement / ms). */
export const SEGMENT = {
  /** Elbow must bend this much below the recent top before a rep starts. */
  startDrop: 20,
  /** The "recent top" is the highest elbow angle over this window, so settling slightly lower can't block a start. */
  topWindowMs: 4000,
  /** Elbow must open this much from the bottom before the rep counts as coming up. */
  rise: 20,
  /** On the way up, bending again by this much may be the next rep (or just a dip at the sticking point). */
  turn: 25,
  /** On the way up, no new high for this long (while the player is visible) ends the rep without lockout. */
  stallMs: 1500,
  /** Losing the player for this long in the middle of a rep discards it. */
  maxGapMs: 1500,
  /** Movements smaller than this are not attempts: neither a counted rep nor a no-rep. */
  minRangeDeg: 45,
  /** ...unless the shoulders still got this low (arm lengths), e.g. a deep rep with the elbows tracked badly. */
  minRangeDepth: 0.75,
  /**
   * When the shoulders are tracked, they must actually drop this much (arm lengths) towards the floor.
   * A glitching elbow point alone doesn't move the shoulders, so this rejects phantom reps.
   */
  minDepthDrop: 0.25,
  /** Without depth, the shoulder must drop this much of the frame height instead. */
  minShoulderDrop: 0.03,
  /** A real lockout peak has a neighbouring frame within this many degrees; a spike doesn't. */
  peakNeighbourDeg: 20,
  /** Holding still this long in the descent (no new low) restarts the rep's clock, so a slow relax at the top isn't judged. */
  restartMs: 1500,
  /** Out of position for this long in the middle of a rep discards it (the player sat up or walked off). */
  notReadyMs: 600,
  /** Reps shorter than this are tracking glitches, not push-ups (a flat-out rep still takes ~0.2 s from start to lockout). */
  minRepMs: 120,
  /** Frames of the rolling median that removes one-frame tracking spikes. */
  median: 3,
  /**
   * Below this frame rate (frame gap in ms) the median is skipped: a flat-out
   * rep is only ~5 frames at 15 fps, and smoothing would erase its peaks.
   */
  medianMaxFrameMs: 50,
}

type Phase = 'top' | 'down' | 'up' | 'turning'

/** Everything measured during one rep. */
interface RepAcc {
  startT: number
  /** Elbow and shoulder height at the top the rep started from. */
  topRef: number
  topDepth: number
  minElbow: number
  minElbowT: number
  minDepth: number
  /** Shoulder height in the frame: highest at the top (smallest y), lowest during the rep (largest y). */
  topShoulder: number
  maxShoulder: number
  /** Highest smoothed elbow on the way up, and when it was reached. */
  upMax: number
  upMaxT: number
  /** Two highest raw elbow readings on the way up. Lockout uses the second, so one spike can't fake it but a brief real peak isn't smoothed away. */
  raw1: number
  raw2: number
  /** Highest shoulder height on the way up, the starting point if the next rep chains on. */
  upDepth: number
  hips: number[]
  knees: number[]
  offsets: number[]
}

function newRep(t: number, topRef: number, topDepth: number, topShoulder = NaN): RepAcc {
  return { startT: t, topRef, topDepth, minElbow: Infinity, minElbowT: t, minDepth: Infinity, topShoulder, maxShoulder: -Infinity, upMax: -Infinity, upMaxT: t, raw1: -Infinity, raw2: -Infinity, upDepth: -Infinity, hips: [], knees: [], offsets: [] }
}

export class RepJudge {
  private phase: Phase = 'top'
  private repCount = 0
  private lastT = -Infinity
  // Rolling median buffers and the recent-top window.
  private elbowBuf: number[] = []
  private depthBuf: number[] = []
  private topHist: { t: number; v: number; d: number; s: number }[] = []
  private frameMs = 0
  /** When the player last was in position (posture ready). */
  private readyT = -Infinity
  private rep: RepAcc = newRep(0, 0, NaN)
  /** While 'turning': a possible next rep, kept in case the dip turns out to be one. */
  private next: RepAcc | null = null

  private thresholds: Thresholds

  constructor(thresholds: Thresholds) {
    this.thresholds = thresholds
  }

  setThresholds(t: Thresholds) {
    this.thresholds = t
  }

  get currentPhase() {
    return this.phase
  }

  /** Feed one frame. Returns a result when a rep finishes on this frame. */
  push(time: number, raw: JudgeInput | null): RepResult | null {
    // Never let time run backwards (clock jumps, duplicate stamps).
    const t = Number.isFinite(this.lastT) ? Math.max(time, this.lastT) : time
    if (!raw || !Number.isFinite(raw.elbow)) {
      if (this.phase !== 'top' && t - this.lastT > SEGMENT.maxGapMs) this.reset()
      return null
    }
    const gap = Number.isFinite(this.lastT) ? t - this.lastT : 0
    if (this.phase !== 'top' && gap > SEGMENT.maxGapMs) this.reset()
    // Time the player was out of view doesn't count towards the stall timer.
    if (gap > 250) this.rep.upMaxT += gap
    this.lastT = t

    // Typical spacing of recent frames decides whether smoothing is safe.
    if (gap > 0 && gap < SEGMENT.maxGapMs) this.frameMs = this.frameMs ? this.frameMs * 0.9 + gap * 0.1 : gap
    const smooth = this.frameMs > 0 && this.frameMs <= SEGMENT.medianMaxFrameMs
    const a: JudgeInput = smooth
      ? { ...raw, elbow: median(this.elbowBuf, raw.elbow), depth: median(this.depthBuf, raw.depth) }
      : { ...raw }
    const sh = raw.shoulderY ?? NaN
    const th = this.thresholds
    const rep = this.rep

    // Out of the push-up position: never start a rep, and drop one that stays out.
    if (raw.ready === false) {
      if (this.phase === 'top') {
        this.topHist = []
        return null
      }
      if (t - this.readyT > SEGMENT.notReadyMs) {
        this.reset()
        return null
      }
    } else this.readyT = t

    switch (this.phase) {
      case 'top': {
        this.topHist.push({ t, v: a.elbow, d: a.depth, s: sh })
        while (this.topHist.length && this.topHist[0].t < t - SEGMENT.topWindowMs) this.topHist.shift()
        const top = Math.max(...this.topHist.map((h) => h.v))
        if (a.elbow <= top - SEGMENT.startDrop) {
          const depths = this.topHist.map((h) => h.d).filter(Number.isFinite)
          const shoulders = this.topHist.map((h) => h.s).filter(Number.isFinite)
          this.rep = newRep(t, top, depths.length ? Math.max(...depths) : NaN, shoulders.length ? Math.min(...shoulders) : NaN)
          track(this.rep, a, t)
          this.phase = 'down'
        }
        return null
      }

      case 'down':
        track(rep, a, t)
        if (t - rep.minElbowT > SEGMENT.restartMs) {
          // Paused partway down (e.g. relaxing the elbows at the top): judge from here on.
          rep.startT = t
          rep.hips = []
          rep.minElbowT = t
        }
        if (a.elbow >= rep.minElbow + SEGMENT.rise) {
          this.phase = 'up'
          rep.upMax = a.elbow
          rep.upMaxT = t
          trackUp(rep, a, raw.elbow)
        }
        return null

      case 'up': {
        track(rep, a, t)
        trackUp(rep, a, raw.elbow)
        if (a.elbow > rep.upMax) {
          rep.upMax = a.elbow
          rep.upMaxT = t
        }
        if (lockout(rep) >= th.lockoutElbow) return this.finishRep(rep, t, a)
        if (a.elbow <= rep.upMax - SEGMENT.turn) {
          // Bending again without locking out: either a dip at the sticking point or the next rep.
          this.phase = 'turning'
          this.next = newRep(t, rep.upMax, rep.upDepth, sh)
          track(this.next, a, t)
          return null
        }
        if (t - rep.upMaxT > SEGMENT.stallMs) return this.finishRep(rep, t, a)
        return null
      }

      case 'turning': {
        // Frames go to the possible next rep only; they are folded back if this was just a dip.
        const next = this.next!
        track(next, a, t)
        if (a.elbow <= next.topRef - SEGMENT.minRangeDeg) {
          // A real new descent: score the last rep (no lockout) and carry on with this one.
          const r = this.finishRep(rep, t, a)
          this.rep = next
          this.next = null
          this.phase = 'down'
          return r
        }
        if (a.elbow >= next.minElbow + SEGMENT.rise) {
          // Just a dip: it's still the same rep, keep pushing up.
          rep.hips.push(...next.hips)
          rep.knees.push(...next.knees)
          rep.offsets.push(...next.offsets)
          rep.minDepth = Math.min(rep.minDepth, next.minDepth)
          rep.maxShoulder = Math.max(rep.maxShoulder, next.maxShoulder)
          this.next = null
          this.phase = 'up'
          rep.upMaxT = t
          trackUp(rep, a, raw.elbow)
          return null
        }
        if (t - rep.upMaxT > SEGMENT.stallMs) return this.finishRep(rep, t, a)
        return null
      }
    }
  }

  /** Call when judging stops. Scores a rep that was on its way up; drops one still going down. */
  finish(t = this.lastT): RepResult | null {
    const r = this.phase === 'up' || this.phase === 'turning' ? this.score(this.rep, t) : null
    this.reset()
    return r
  }

  /** Ends a rep and goes back to waiting at the top. */
  private finishRep(rep: RepAcc, t: number, a: JudgeInput): RepResult | null {
    this.phase = 'top'
    this.next = null
    this.topHist = [{ t, v: Math.max(a.elbow, rep.upMax), d: a.depth, s: a.shoulderY ?? NaN }]
    return this.score(rep, t)
  }

  /** Scores a finished rep. Returns null if it was too small or short to be an attempt. */
  private score(rep: RepAcc, t: number): RepResult | null {
    const haveDepth = Number.isFinite(rep.minDepth)
    const depthDrop = rep.topDepth - rep.minDepth
    const shoulderDrop = rep.maxShoulder - rep.topShoulder
    // The body must really have moved: a glitching elbow point alone moves neither the shoulder height nor its y.
    const bodyMoved = haveDepth && Number.isFinite(depthDrop)
      ? depthDrop >= SEGMENT.minDepthDrop
      : !Number.isFinite(shoulderDrop) || shoulderDrop >= SEGMENT.minShoulderDrop
    const isAttempt =
      t - rep.startT >= SEGMENT.minRepMs &&
      (rep.topRef - rep.minElbow >= SEGMENT.minRangeDeg || rep.minDepth <= SEGMENT.minRangeDepth) &&
      bodyMoved
    if (!isAttempt) return null

    const th = this.thresholds
    const hip = robustLow(rep.hips)
    const knee = robustLow(rep.knees)
    const top = lockout(rep)
    const kneesOk = !Number.isFinite(knee) || knee >= th.knee
    const lights = {
      depth: haveDepth ? rep.minDepth <= th.depth : rep.minElbow <= th.depthElbowFallback,
      torso: Number.isFinite(hip) && hip >= th.torsoHip && kneesOk,
      lockout: top >= th.lockoutElbow,
    }
    const faults: string[] = []
    if (!lights.depth) {
      faults.push(haveDepth
        ? `Not deep enough: shoulder stayed ${rep.minDepth.toFixed(2)} arm lengths up (needs ${th.depth})`
        : `Not deep enough: elbows only bent to ${Math.round(rep.minElbow)}° (needs ${th.depthElbowFallback}°; hands not visible)`)
    }
    if (!lights.torso) {
      if (!Number.isFinite(hip)) faults.push('Body not straight: hips not visible')
      else if (hip < th.torsoHip) {
        // Which way the body bent over the rep.
        const off = middle(rep.offsets)
        const how = off > 0 ? 'hips sagging' : off < 0 ? 'hips piked up' : 'body bent'
        faults.push(`Body not straight (${how}): ${Math.round(hip)}° at the abdomen (needs ${th.torsoHip}°)`)
      }
      if (!kneesOk) faults.push(`Knees bent: ${Math.round(knee)}° (needs ${th.knee}°)`)
    }
    if (!lights.lockout) faults.push(`No lockout: elbows reached ${Number.isFinite(top) ? Math.round(top) : '—'}° (needs ${th.lockoutElbow}°)`)
    const whiteCount = LIGHTS.filter((l) => lights[l]).length
    return {
      rep: ++this.repCount,
      startT: rep.startT,
      endT: t,
      lights,
      whiteCount,
      counted: whiteCount >= 2,
      perfect: whiteCount === 3,
      measured: { depth: haveDepth ? rep.minDepth : NaN, bottomElbow: rep.minElbow, hip, knee, lockout: top },
      faults,
    }
  }

  private reset() {
    this.phase = 'top'
    this.topHist = []
    this.next = null
    this.rep = newRep(0, 0, NaN)
  }
}

function track(rep: RepAcc, a: JudgeInput, t: number) {
  if (a.elbow < rep.minElbow) { rep.minElbow = a.elbow; rep.minElbowT = t }
  if (a.shoulderY != null && Number.isFinite(a.shoulderY)) rep.maxShoulder = Math.max(rep.maxShoulder, a.shoulderY)
  if (Number.isFinite(a.depth)) rep.minDepth = Math.min(rep.minDepth, a.depth)
  if (Number.isFinite(a.hip)) rep.hips.push(a.hip)
  if (a.knee != null && Number.isFinite(a.knee)) rep.knees.push(a.knee)
  if (a.bodyOffset != null && Number.isFinite(a.bodyOffset)) rep.offsets.push(a.bodyOffset)
}

function trackUp(rep: RepAcc, a: JudgeInput, rawElbow: number) {
  if (rawElbow > rep.raw1) { rep.raw2 = rep.raw1; rep.raw1 = rawElbow }
  else if (rawElbow > rep.raw2) rep.raw2 = rawElbow
  if (Number.isFinite(a.depth)) rep.upDepth = Math.max(rep.upDepth, a.depth)
}

/**
 * How straight the arms got on the way up. The highest raw reading counts if a
 * neighbouring frame was close to it (a real, brief peak on a fast rep);
 * otherwise it's a spike and the second-highest is used.
 */
function lockout(rep: RepAcc) {
  const peak = rep.raw1 - rep.raw2 <= SEGMENT.peakNeighbourDeg ? rep.raw1 : rep.raw2
  return Math.max(rep.upMax, peak)
}

/** Rolling median of the last SEGMENT.median values: removes one-frame spikes but keeps real peaks. */
function median(buf: number[], x: number) {
  if (!Number.isFinite(x)) return x
  buf.push(x)
  if (buf.length > SEGMENT.median) buf.shift()
  const s = [...buf].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function middle(values: number[]) {
  if (!values.length) return NaN
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** The 10th-percentile value: low enough to catch a real sag, high enough to ignore one noisy frame. */
function robustLow(values: number[]) {
  if (!values.length) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  // Always skip the single worst frame when there are enough to spare (short, fast reps).
  const i = sorted.length >= 3 ? Math.max(1, Math.floor(sorted.length * 0.1)) : 0
  return sorted[i]
}

export type LightState = 'off' | 'white' | 'red'

/** Lights shown for a rep, or all off while waiting. */
export function lightStates(last: RepResult | null): Record<Light, LightState> {
  const s = (l: Light): LightState => (last ? (last.lights[l] ? 'white' : 'red') : 'off')
  return { depth: s('depth'), torso: s('torso'), lockout: s('lockout') }
}

export interface SessionSummary {
  attempted: number
  counted: number
  perfect: number
  failed: number
  /** counted / attempted, 0..1 (null with no attempts). */
  accuracy: number | null
  /** Share of reps that got each light white, 0..1. */
  lightRates: Record<Light, number | null>
  durationMs: number
}

export function summarise(results: RepResult[], durationMs = 0): SessionSummary {
  const n = results.length
  const rate = (k: Light) => (n ? results.filter((r) => r.lights[k]).length / n : null)
  const counted = results.filter((r) => r.counted).length
  return {
    attempted: n,
    counted,
    perfect: results.filter((r) => r.perfect).length,
    failed: n - counted,
    accuracy: n ? counted / n : null,
    lightRates: { depth: rate('depth'), torso: rate('torso'), lockout: rate('lockout') },
    durationMs,
  }
}
