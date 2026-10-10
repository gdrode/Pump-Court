/**
 * Sounds. Drop chime.mp3, buzzer.mp3 and norep.mp3 (the ElevenLabs "No rep!") into
 * frontend/public/sounds/. Until then a synthesised tone plays instead.
 */
export type SoundId = "chime" | "buzzer" | "norep" | "beep" | "go" | "final";

const files: Partial<Record<SoundId, string>> = {
  chime: "/sounds/chime.mp3",
  buzzer: "/sounds/buzzer.mp3",
  norep: "/sounds/norep.mp3",
};

const cache = new Map<SoundId, HTMLAudioElement | null>();
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

export function preloadSounds() {
  for (const [id, src] of Object.entries(files) as [SoundId, string][]) {
    const a = new Audio(src);
    a.preload = "auto";
    a.addEventListener("error", () => cache.set(id, null), { once: true });
    a.addEventListener("canplaythrough", () => cache.set(id, a), { once: true });
  }
}

export function play(id: SoundId) {
  if (muted) return;
  const a = cache.get(id);
  if (a) {
    a.currentTime = 0;
    void a.play().catch(() => synth(id));
    return;
  }
  if (id === "norep") return; // the buzzer already covers it
  synth(id);
}

function synth(id: SoundId) {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType, vol = 0.18) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, now + start);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(now + start);
      o.stop(now + start + dur);
    };
    if (id === "chime") { tone(880, 0, 0.18, "sine"); tone(1318, 0.07, 0.3, "sine"); }
    if (id === "buzzer") tone(110, 0, 0.35, "sawtooth", 0.12);
    if (id === "beep") tone(660, 0, 0.15, "square", 0.08);
    if (id === "go") tone(990, 0, 0.4, "square", 0.1);
    if (id === "final") { tone(220, 0, 0.9, "sawtooth", 0.12); tone(165, 0, 0.9, "sawtooth", 0.1); }
  } catch {
    /* audio blocked until a key press; ignore */
  }
}
