// Ding and buzzer, synthesised with the Web Audio API: no sound files to
// download, and they work offline.

let ctx: AudioContext | null = null

/** Browsers only allow sound after a click, so call this from the Start button. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    ctx = null
  }
}

function tone(freq: number, type: OscillatorType, start: number, dur: number, gain: number, out: AudioNode) {
  const c = ctx!
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g).connect(out)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Bell-like ding for a rep that counts. `perfect` adds a second, higher note. */
export function ding(perfect = false) {
  if (!ctx) return
  const t = ctx.currentTime
  const out = ctx.destination
  // A bell is a fundamental plus a few inharmonic partials that die away faster.
  tone(1318.5, 'sine', t, 0.9, 0.35, out)
  tone(2637, 'sine', t, 0.4, 0.12, out)
  tone(3950, 'sine', t, 0.2, 0.05, out)
  if (perfect) {
    tone(1760, 'sine', t + 0.12, 0.9, 0.3, out)
    tone(3520, 'sine', t + 0.12, 0.35, 0.1, out)
  }
}

/** Game-show buzzer for a rep that doesn't count. */
export function buzzer() {
  if (!ctx) return
  const t = ctx.currentTime
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1200
  filter.connect(ctx.destination)
  // Two slightly detuned square waves beat against each other for the rasp.
  for (const f of [110, 116.5]) {
    const c = ctx
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'square'
    osc.frequency.value = f
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.18, t + 0.01)
    g.gain.setValueAtTime(0.18, t + 0.45)
    g.gain.linearRampToValueAtTime(0, t + 0.55)
    osc.connect(g).connect(filter)
    osc.start(t)
    osc.stop(t + 0.6)
  }
}
