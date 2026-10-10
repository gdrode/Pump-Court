// Placeholder sounds made with the Web Audio API, so no files are needed.
// Swap these for recorded chime / buzzer / "No rep!" files later.

let ctx: AudioContext | null = null;

function tone(freq: number, durationS: number, type: OscillatorType, delayS = 0, gain = 0.2) {
  ctx ??= new AudioContext();
  const t = ctx.currentTime + delayS;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + durationS);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durationS);
}

export const sounds = {
  chime: () => {
    tone(880, 0.25, "sine");
    tone(1320, 0.35, "sine", 0.08);
  },
  buzzer: () => tone(140, 0.45, "square", 0, 0.12),
  countdown: () => tone(660, 0.15, "sine"),
  go: () => tone(990, 0.4, "sine"),
  finalBuzzer: () => tone(220, 1.0, "sawtooth", 0, 0.15),
};
