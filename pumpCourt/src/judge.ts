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
  /**
   * Share of the player's own straight-arm top height the shoulders must drop
   * (0.4 = down to 60% of it). Relative to the player's top, so it doesn't
   * depend on where the hands are placed or how the camera sees the arm.
   */
  depthDrop: number
}

export const DIFFICULTY: Record<Difficulty, Thresholds & { label: string; blurb: string }> = {
  easy: { label: 'Easy', blurb: 'Elbows to about 90°, small sag allowed', lockoutElbow: 145, torsoHip: 145, knee: 140, depthDrop: 0.25, depthElbowFallback: 100 },
  normal: { label: 'Normal', blurb: 'Chest close to the floor, body mostly straight', lockoutElbow: 155, torsoHip: 155, knee: 150, depthDrop: 0.3, depthElbowFallback: 95 },
  hard: { label: 'Hard', blurb: 'Chest near the floor, rigid plank, full lockout', lockoutElbow: 165, torsoHip: 165, knee: 160, depthDrop: 0.35, depthElbowFallback: 90 },
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
    /** Share of the top height the shoulders dropped (NaN without height). */
    depthDrop: number
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

/**
 * Reps are found from a "drive" signal: the shoulders' height above the floor
 * line when it is known (posture.ts), else the elbow angle. Height works however
 * the elbows move: flared elbows seen side-on barely seem to bend, but the
 * shoulders still go all the way down and up. Height is scaled so a full rep
 * spans about as many units as the elbow's ~100°, and the constants below
 * (in degrees) apply to both.
 */
export const HEIGHT_TO_DRIVE = 150

/** Rep segmentation constants (drive units ≈ degrees of elbow movement / ms). */
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
  /**
   * With shoulder height known: a movement is an attempt only if the shoulders
   * drop at least this share of the player's top height. Quarter reps and
   * adjustments at the top (shifting, settling) are ignored: no lights at all.
   */
  minAttemptDrop: 0.25,
  /** Without depth, the shoulder must drop this much of the frame height instead. */
  minShoulderDrop: 0.03,
  /** A real lockout peak has a neighbouring frame within this many degrees; a spike doesn't. */
  peakNeighbourDeg: 20,
  /** Holding still this long in the descent (no new low) restarts the rep's clock, so a slow relax at the top isn't judged. */
  restartMs: 1500,
  /** Out of position for this long in the middle of a rep discards it (the player sat up or walked off). */
  notReadyMs: 600,
  /**
   * A push-up is two parts: down, then back up. The shoulders must come back up
   * at least this share of the way they went down (or the elbows, when the
   * shoulders can't be measured) before the rep is judged at all. Collapsing
   * to the floor at failure is a descent with no ascent: not a rep.
   */
  minAscent: 0.6,
  /**
   * Lockout by height: shoulders back within this many arm lengths of the
   * player's straight-arm top height count as locked out, whatever the elbow
   * reads. Straight arms often read only 155–165° side-on (and less with
   * flared elbows), but the shoulders can only get back to the top with the
   * arms straight.
   */
  lockoutHeightTol: 0.05,
  /** A real brief top has a neighbouring frame within this height (arm lengths); a spike doesn't. */
  peakHeightNeighbour: 0.1,
  /** The straight-arm top height is the highest shoulder height seen at the top over this window. */
  topHeightWindowMs: 30_000,
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
  /** Which signal drives this rep: shoulder height ('height') or elbow angle ('elbow'). */
  driveKind: DriveKind
  /** Drive value and shoulder height at the top the rep started from. */
  topRef: number
  topDepth: number
  /** Lowest drive value, and when it was reached. */
  minDrive: number
  minDriveT: number
  minElbow: number
  minDepth: number
  /** Shoulder height in the frame: highest at the top (smallest y), lowest during the rep (largest y). */
  topShoulder: number
  maxShoulder: number
  /** Highest drive value on the way up, and when it was reached. */
  upMax: number
  upMaxT: number
  /** Highest smoothed elbow angle on the way up (for the lockout light). */
  upElbow: number
  /** Two highest raw elbow readings on the way up. Lockout uses the second, so one spike can't fake it but a brief real peak isn't smoothed away. */
  raw1: number
  raw2: number
  /** Highest shoulder height on the way up, the starting point if the next rep chains on. */
  upDepth: number
  /** Highest point of the shoulder in the frame on the way up (smallest y). */
  upShoulder: number
  /** Two highest raw shoulder heights on the way up (same spike rule as raw1/raw2). */
  rawUp1: number
  rawUp2: number
  hips: number[]
  knees: number[]
  offsets: number[]
  /** Smoothed shoulder heights through the rep, for a robust bottom. */
  depths: number[]
}

type DriveKind = 'height' | 'elbow'

function newRep(t: number, driveKind: DriveKind, topRef: number, topDepth: number, topShoulder = NaN): RepAcc {
  return { startT: t, driveKind, topRef, topDepth, minDrive: Infinity, minDriveT: t, minElbow: Infinity, minDepth: Infinity, topShoulder, maxShoulder: -Infinity, upMax: -Infinity, upMaxT: t, upElbow: -Infinity, raw1: -Infinity, raw2: -Infinity, upDepth: -Infinity, upShoulder: Infinity, rawUp1: -Infinity, rawUp2: -Infinity, hips: [], knees: [], offsets: [], depths: [] }
}

export class RepJudge {
  private phase: Phase = 'top'
  private repCount = 0
  private lastT = -Infinity
  // Rolling median buffers and the recent-top window.
  private elbowBuf: number[] = []
  private depthBuf: number[] = []
  private topHist: { t: number; v: number; d: number; s: number }[] = []
  /** Signal the top window was filled with; switching signals restarts it. */
  private topKind: DriveKind | null = null
  /** Shoulder heights seen at the top (between reps), for the straight-arm reference. */
  private topHeights: { t: number; d: number }[] = []
  private frameMs = 0
  /** When the player last was in position (posture ready). */
  private readyT = -Infinity
  private rep: RepAcc = newRep(0, 'elbow', 0, NaN)
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

    // The drive signal for this frame (see HEIGHT_TO_DRIVE).
    const kind: DriveKind = Number.isFinite(a.depth) ? 'height' : 'elbow'
    const v = kind === 'height' ? a.depth * HEIGHT_TO_DRIVE : a.elbow
    // A rep is measured with one signal throughout; frames with the other one are only tracked.
    if (this.phase !== 'top' && kind !== rep.driveKind) {
      track(rep, a, t, NaN)
      return null
    }

    switch (this.phase) {
      case 'top': {
        if (this.topKind !== kind) this.topHist = []
        this.topKind = kind
        this.topHist.push({ t, v, d: a.depth, s: sh })
        while (this.topHist.length && this.topHist[0].t < t - SEGMENT.topWindowMs) this.topHist.shift()
        if (Number.isFinite(a.depth)) {
          this.topHeights.push({ t, d: a.depth })
          while (this.topHeights.length && this.topHeights[0].t < t - SEGMENT.topHeightWindowMs) this.topHeights.shift()
        }
        const top = Math.max(...this.topHist.map((h) => h.v))
        if (v <= top - SEGMENT.startDrop) {
          const depths = this.topHist.map((h) => h.d).filter(Number.isFinite)
          const shoulders = this.topHist.map((h) => h.s).filter(Number.isFinite)
          this.rep = newRep(t, kind, top, depths.length ? Math.max(...depths) : NaN, shoulders.length ? Math.min(...shoulders) : NaN)
          track(this.rep, a, t, v)
          this.phase = 'down'
        }
        return null
      }

      case 'down':
        track(rep, a, t, v)
        if (t - rep.minDriveT > SEGMENT.restartMs) {
          // Paused partway down (e.g. relaxing the elbows at the top): judge from here on.
          rep.startT = t
          rep.hips = []
          rep.minDriveT = t
        }
        if (v >= rep.minDrive + SEGMENT.rise) {
          this.phase = 'up'
          rep.upMax = v
          rep.upMaxT = t
          trackUp(rep, a, raw)
        }
        return null

      case 'up': {
        track(rep, a, t, v)
        trackUp(rep, a, raw)
        if (v > rep.upMax) {
          rep.upMax = v
          rep.upMaxT = t
        }
        // Arms locked out after coming most of the way back up: done.
        // Locked out (straight elbows, or shoulders back at the top) after coming most of the way back up: judge now.
        if (this.lockedOut(rep) && ascent(rep) >= SEGMENT.minAscent) return this.finishRep(rep, t, a, v)
        if (v <= rep.upMax - SEGMENT.turn) {
          // Going down again without locking out: either a dip at the sticking point or the next rep.
          this.phase = 'turning'
          this.next = newRep(t, kind, rep.upMax, rep.upDepth, sh)
          track(this.next, a, t, v)
          return null
        }
        // Stalled near the top: score it without lockout. Stalled lower down: keep waiting (a grind), never score half a rep.
        if (t - rep.upMaxT > SEGMENT.stallMs && ascent(rep) >= SEGMENT.minAscent) return this.finishRep(rep, t, a, v)
        return null
      }

      case 'turning': {
        // Frames go to the possible next rep only; they are folded back if this was just a dip.
        const next = this.next!
        track(next, a, t, v)
        if (v <= next.topRef - SEGMENT.minRangeDeg) {
          // A real new descent: score the last rep (no lockout) and carry on with this one.
          const r = this.finishRep(rep, t, a, v)
          this.rep = next
          this.next = null
          this.phase = 'down'
          return r
        }
        if (v >= next.minDrive + SEGMENT.rise) {
          // Just a dip: it's still the same rep, keep pushing up.
          rep.hips.push(...next.hips)
          rep.knees.push(...next.knees)
          rep.offsets.push(...next.offsets)
          rep.minDepth = Math.min(rep.minDepth, next.minDepth)
          rep.depths.push(...next.depths)
          rep.minElbow = Math.min(rep.minElbow, next.minElbow)
          rep.maxShoulder = Math.max(rep.maxShoulder, next.maxShoulder)
          this.next = null
          this.phase = 'up'
          rep.upMaxT = t
          trackUp(rep, a, raw)
          return null
        }
        if (t - rep.upMaxT > SEGMENT.stallMs && ascent(rep) >= SEGMENT.minAscent) return this.finishRep(rep, t, a, v)
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

  /** The player's straight-arm shoulder height: the highest seen at the top recently. */
  private topHeight() {
    return this.topHeights.length ? Math.max(...this.topHeights.map((h) => h.d)) : NaN
  }

  /** Arms straight: the elbow reads locked out, or the shoulders are back at the straight-arm top height. */
  private lockedOut(rep: RepAcc) {
    if (lockout(rep) >= this.thresholds.lockoutElbow) return true
    const top = Math.max(this.topHeight(), rep.topDepth)
    // Highest raw height if a neighbouring frame was close to it (a real brief top), else the second highest (a spike).
    const peak = rep.rawUp1 - rep.rawUp2 <= SEGMENT.peakHeightNeighbour ? rep.rawUp1 : rep.rawUp2
    const up = Math.max(rep.upDepth, peak)
    return Number.isFinite(top) && Number.isFinite(up) && up >= top - SEGMENT.lockoutHeightTol
  }

  /** Ends a rep and goes back to waiting at the top. */
  private finishRep(rep: RepAcc, t: number, a: JudgeInput, v: number): RepResult | null {
    this.phase = 'top'
    this.next = null
    this.topKind = rep.driveKind
    this.topHist = [{ t, v: Math.max(v, rep.upMax), d: a.depth, s: a.shoulderY ?? NaN }]
    return this.score(rep, t)
  }

  /** Scores a finished rep. Returns null if it was too small or short to be an attempt. */
  private score(rep: RepAcc, t: number): RepResult | null {
    const haveDepth = Number.isFinite(rep.minDepth)
    // Bottom of the rep, ignoring the single lowest reading so one bad frame can't pass depth.
    const bottom = robustBottom(rep.depths)
    const topH = Math.max(this.topHeight(), rep.topDepth)
    /** Share of the straight-arm top height the shoulders dropped. */
    const drop = haveDepth && topH > 0 ? (topH - bottom) / topH : NaN
    let isAttempt: boolean
    if (Number.isFinite(drop)) {
      // Height known: a real descent (not a quarter rep or an adjustment), and back up again.
      // The descent must be seen in this rep (from where it started), not just measured against the top.
      const seen = Number.isFinite(rep.topDepth) ? (rep.topDepth - bottom) / topH : drop
      isAttempt = t - rep.startT >= SEGMENT.minRepMs && seen >= SEGMENT.minAttemptDrop && ascent(rep) >= SEGMENT.minAscent
    } else {
      // Elbow only: enough bend, the shoulders really moved (not an elbow-point glitch), and back up again.
      const shoulderDrop = rep.maxShoulder - rep.topShoulder
      const bodyMoved = !Number.isFinite(shoulderDrop) || shoulderDrop >= SEGMENT.minShoulderDrop
      isAttempt = t - rep.startT >= SEGMENT.minRepMs && rep.topRef - rep.minDrive >= SEGMENT.minRangeDeg && bodyMoved && ascent(rep) >= SEGMENT.minAscent
    }
    if (!isAttempt) return null

    const th = this.thresholds
    const hip = robustLow(rep.hips)
    const knee = robustLow(rep.knees)
    const top = lockout(rep)
    const kneesOk = !Number.isFinite(knee) || knee >= th.knee
    const lights = {
      depth: Number.isFinite(drop) ? drop >= th.depthDrop : rep.minElbow <= th.depthElbowFallback,
      torso: Number.isFinite(hip) && hip >= th.torsoHip && kneesOk,
      lockout: this.lockedOut(rep),
    }
    const faults: string[] = []
    if (!lights.depth) {
      faults.push(haveDepth
        ? `Not deep enough: shoulders dropped ${Math.round(drop * 100)}% of their height (needs ${Math.round(th.depthDrop * 100)}%)`
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
    if (!lights.lockout) faults.push(`No lockout: didn't get back to the top (elbows ${Number.isFinite(top) ? Math.round(top) : '—'}°, needs ${th.lockoutElbow}°)`)
    const whiteCount = LIGHTS.filter((l) => lights[l]).length
    return {
      rep: ++this.repCount,
      startT: rep.startT,
      endT: t,
      lights,
      whiteCount,
      counted: whiteCount >= 2,
      perfect: whiteCount === 3,
      measured: { depth: haveDepth ? bottom : NaN, depthDrop: drop, bottomElbow: rep.minElbow, hip, knee, lockout: top },
      faults,
    }
  }

  private reset() {
    this.phase = 'top'
    this.topHist = []
    // topHeights is kept: the straight-arm reference outlives a lost rep (it expires after topHeightWindowMs).
    this.next = null
    this.rep = newRep(0, 'elbow', 0, NaN)
  }
}

function track(rep: RepAcc, a: JudgeInput, t: number, v: number) {
  if (v < rep.minDrive) { rep.minDrive = v; rep.minDriveT = t }
  if (Number.isFinite(a.elbow)) rep.minElbow = Math.min(rep.minElbow, a.elbow)
  if (a.shoulderY != null && Number.isFinite(a.shoulderY)) rep.maxShoulder = Math.max(rep.maxShoulder, a.shoulderY)
  if (Number.isFinite(a.depth)) {
    rep.minDepth = Math.min(rep.minDepth, a.depth)
    rep.depths.push(a.depth)
  }
  if (Number.isFinite(a.hip)) rep.hips.push(a.hip)
  if (a.knee != null && Number.isFinite(a.knee)) rep.knees.push(a.knee)
  if (a.bodyOffset != null && Number.isFinite(a.bodyOffset)) rep.offsets.push(a.bodyOffset)
}

function trackUp(rep: RepAcc, a: JudgeInput, raw: JudgeInput) {
  const rawElbow = raw.elbow
  if (rawElbow > rep.raw1) { rep.raw2 = rep.raw1; rep.raw1 = rawElbow }
  else if (rawElbow > rep.raw2) rep.raw2 = rawElbow
  // Raw heights too: a touch-and-go top lasts one frame, which smoothing would flatten.
  if (Number.isFinite(raw.depth)) {
    if (raw.depth > rep.rawUp1) { rep.rawUp2 = rep.rawUp1; rep.rawUp1 = raw.depth }
    else if (raw.depth > rep.rawUp2) rep.rawUp2 = raw.depth
  }
  if (Number.isFinite(a.depth)) rep.upDepth = Math.max(rep.upDepth, a.depth)
  if (Number.isFinite(a.elbow)) rep.upElbow = Math.max(rep.upElbow, a.elbow)
  if (a.shoulderY != null && Number.isFinite(a.shoulderY)) rep.upShoulder = Math.min(rep.upShoulder, a.shoulderY)
}

/**
 * Share of the descent the player has pushed back up: 0 at the bottom, 1 back
 * at the top. Measured with shoulder height above the floor when known, else
 * the shoulder's position in the frame, else the elbow angle.
 */
function ascent(rep: RepAcc) {
  const share = (up: number, down: number) => (down > 0 ? up / down : 0)
  if (Number.isFinite(rep.minDepth) && Number.isFinite(rep.topDepth) && Number.isFinite(rep.upDepth)) {
    return share(rep.upDepth - rep.minDepth, rep.topDepth - rep.minDepth)
  }
  if (Number.isFinite(rep.topShoulder) && Number.isFinite(rep.upShoulder) && Number.isFinite(rep.maxShoulder)) {
    return share(rep.maxShoulder - rep.upShoulder, rep.maxShoulder - rep.topShoulder)
  }
  return share(rep.upMax - rep.minDrive, rep.topRef - rep.minDrive)
}

/**
 * How straight the arms got on the way up. The highest raw reading counts if a
 * neighbouring frame was close to it (a real, brief peak on a fast rep);
 * otherwise it's a spike and the second-highest is used.
 */
function lockout(rep: RepAcc) {
  const peak = rep.raw1 - rep.raw2 <= SEGMENT.peakNeighbourDeg ? rep.raw1 : rep.raw2
  return Math.max(rep.upElbow, peak)
}

/** Rolling median of the last SEGMENT.median values: removes one-frame spikes but keeps real peaks. */
function median(buf: number[], x: number) {
  if (!Number.isFinite(x)) return x
  buf.push(x)
  if (buf.length > SEGMENT.median) buf.shift()
  const s = [...buf].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** The lowest value, except the single lowest when there are enough frames to spare one. */
function robustBottom(values: number[]) {
  if (!values.length) return NaN
  const s = [...values].sort((a, b) => a - b)
  return s.length >= 4 ? s[1] : s[0]
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
