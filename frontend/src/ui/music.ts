// Background music player (operator window only; the crowd screen stays silent).
// Exactly one track is heard at a time: the streak track while a streak is on,
// else the scene's track (menu playlist or a game track). Switching fades the
// old one out fully, then fades the new one in. Volume and mute are remembered
// on this computer.
import { useEffect, useId, useSyncExternalStore } from "react";
import {
  GAME_TRACKS,
  MENU_TRACKS,
  MUSIC_FADE_IN_MS,
  MUSIC_FADE_OUT_MS,
  MUSIC_VOLUME_DEFAULT,
  STREAK_CUT_MS,
  STREAK_MUSIC_RATE,
  STREAK_RESUME_MS,
  STREAK_TRACK,
  type Track,
} from "../config/music";

export type MusicScene = "menu" | "game";

// ---- volume ----

const KEY = "pump-court:music";
const listeners = new Set<() => void>();
let settings = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.volume === "number") return { volume: Math.min(1, Math.max(0, s.volume)), muted: !!s.muted };
  } catch {
    /* not remembered */
  }
  return { volume: MUSIC_VOLUME_DEFAULT, muted: false };
})();
/** Slider 0–1 → element volume. Squared, so the slider feels even: 0 = silent, 1 = full. */
const level = () => (settings.muted ? 0 : settings.volume ** 2);

// ---- elements ----

/** Every element this player made (to silence them all, and to clean up on a hot reload in dev). */
const all = new Set<HTMLAudioElement>();
/** How loud each element should be, 0–1 of `level()` (fades move this). */
const share = new Map<HTMLAudioElement, number>();
const fades = new Map<HTMLAudioElement, number>();
/** Files that failed to load (missing): skipped from then on. */
const missing = new Set<string>();

function setShare(a: HTMLAudioElement, k: number) {
  share.set(a, k);
  a.volume = Math.min(1, Math.max(0, k * level()));
}

/** Fades `a` to `to` (0–1) over `ms`, then calls `done`. */
function fade(a: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  clearInterval(fades.get(a));
  const from = share.get(a) ?? 0;
  const t0 = performance.now();
  const timer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
    setShare(a, from + (to - from) * k);
    if (k >= 1) {
      clearInterval(timer);
      fades.delete(a);
      done?.();
    }
  }, 30);
  fades.set(a, timer);
}

/** Browsers (and the app's webview) block sound until the first click or key. */
function play(a: HTMLAudioElement) {
  a.play().catch((e: DOMException) => {
    if (e?.name !== "NotAllowedError") return;
    const go = () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
      if (wanted() === a) void a.play().catch(() => {});
    };
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
  });
}

function open(track: Track, loop: boolean, onMissing: () => void): HTMLAudioElement {
  const a = new Audio(track.file);
  a.preload = "auto";
  a.loop = loop;
  setShare(a, 0);
  all.add(a);
  a.addEventListener(
    "error",
    () => {
      missing.add(track.file);
      drop(a);
      onMissing();
    },
    { once: true },
  );
  return a;
}

/** Stops `a` for good. */
function drop(a: HTMLAudioElement | null, ms = 0) {
  if (!a) return;
  const end = () => {
    a.pause();
    all.delete(a);
    share.delete(a);
  };
  if (ms > 0 && !a.paused) fade(a, 0, ms, end);
  else {
    clearInterval(fades.get(a));
    end();
  }
}

// ---- what plays ----

let scene: MusicScene | null = null;
/** The scene's track (paused underneath while the streak track plays). */
let base: HTMLAudioElement | null = null;
let streak: HTMLAudioElement | null = null;
let startTimer = 0;
let resumeTimer = 0;

const wanted = () => streak ?? base;

/**
 * Makes the right track the only one heard: fades every other one out (and
 * pauses it), then fades the wanted one in.
 */
function apply(fadeOut = MUSIC_FADE_OUT_MS) {
  clearTimeout(startTimer);
  const want = wanted();
  let busy = false;
  for (const a of all) {
    if (a === want) continue;
    // `base` under the streak track is kept (paused) to resume; anything else is done with.
    const keep = a === base || a === streak;
    if (a.paused) {
      if (!keep) drop(a);
      continue;
    }
    busy = true;
    fade(a, 0, fadeOut, () => {
      if (wanted() === a) return;
      a.pause();
      if (a !== base && a !== streak) drop(a);
    });
  }
  if (!want) return;
  if (!want.paused) return fade(want, 1, MUSIC_FADE_IN_MS);
  startTimer = window.setTimeout(
    () => {
      if (wanted() !== want) return;
      play(want);
      fade(want, 1, MUSIC_FADE_IN_MS);
    },
    busy ? fadeOut : 0,
  );
}

let menuOrder: Track[] = [];
let menuAt = 0;
const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Opens the scene's next track as `base` (menu: the next in a shuffled order; game: one at random, looped). */
function nextBase(tries = 6) {
  const menu = scene === "menu";
  const live = (menu ? MENU_TRACKS : GAME_TRACKS).filter((t) => !missing.has(t.file));
  base = null;
  if (live.length && tries > 0) {
    let track: Track;
    if (menu) {
      if (menuAt >= menuOrder.length) {
        // Never the same track twice in a row across a reshuffle.
        const last = menuOrder[menuOrder.length - 1];
        menuOrder = shuffle(live);
        if (menuOrder.length > 1 && menuOrder[0] === last) menuOrder.push(menuOrder.shift()!);
        menuAt = 0;
      }
      track = menuOrder[menuAt++];
    } else track = live[Math.floor(Math.random() * live.length)];
    if (missing.has(track.file)) return nextBase(tries - 1);
    const a = open(track, !menu, () => base === a && nextBase(tries - 1));
    if (menu) a.addEventListener("ended", () => base === a && nextBase());
    base = a;
  }
  apply(); // fades the old track out

}

function setScene(next: MusicScene) {
  if (next === scene) return;
  scene = next;
  nextBase();
}

// ---- streak: on while any player (Duel: either) has a tier ----

const tiers = new Map<string, number>();

function updateStreak() {
  const tier = Math.max(0, ...tiers.values());
  if (tier > 0 && !missing.has(STREAK_TRACK.file)) {
    clearTimeout(resumeTimer);
    if (!streak) {
      const a = open(STREAK_TRACK, true, () => {
        if (streak === a) {
          streak = null;
          apply();
        }
      });
      streak = a;
      apply(STREAK_CUT_MS);
    }
    streak.playbackRate = STREAK_MUSIC_RATE[tier] ?? 1;
  } else if (tier === 0 && streak) {
    // Cut at once; the round's track comes back where it was after the "lol...".
    drop(streak, STREAK_CUT_MS);
    streak = null;
    clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(apply, STREAK_RESUME_MS);
  }
}

// ---- dev: a hot reload of this file must not leave the old player running ----

const w = window as unknown as { __pumpCourtMusic?: Set<HTMLAudioElement> };
w.__pumpCourtMusic?.forEach((a) => a.pause());
w.__pumpCourtMusic = all;
(import.meta as unknown as { hot?: { dispose(cb: () => void): void } }).hot?.dispose(() => {
  clearTimeout(startTimer);
  clearTimeout(resumeTimer);
  fades.forEach((t) => clearInterval(t));
  all.forEach((a) => a.pause());
});

// ---- hooks ----

/** The operator window's music: menu between rounds, a game track during one. */
export function useMusicScene(next: MusicScene) {
  useEffect(() => setScene(next), [next]);
}

/** One player's streak tier (0 = none); the streak track plays while any is above 0. */
export function useStreakMusic(tier: number, enabled: boolean) {
  const id = useId();
  useEffect(() => {
    if (!enabled) return;
    tiers.set(id, tier);
    updateStreak();
  }, [id, tier, enabled]);
  useEffect(
    () => () => {
      tiers.delete(id);
      updateStreak();
    },
    [id],
  );
}

export function setMusicVolume(volume: number, muted = settings.muted) {
  settings = { volume: Math.min(1, Math.max(0, volume)), muted };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* works for this session */
  }
  for (const a of all) setShare(a, share.get(a) ?? 0);
  listeners.forEach((cb) => cb());
}

/** Music volume (0–1) and mute, for the gear menu. */
export function useMusicVolume() {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => settings,
  );
  return {
    volume: s.volume,
    muted: s.muted,
    setVolume: (v: number) => setMusicVolume(v, false),
    toggleMute: () => setMusicVolume(s.volume, !s.muted),
  };
}

const ALL = [...MENU_TRACKS, ...GAME_TRACKS, STREAK_TRACK];
/** One line per track (title, artist, licence), for the credits tooltip. */
export const MUSIC_CREDITS = ALL.map((t) => `${t.title} · ${t.artist} · ${t.license}`);
/** "Music: Toby Fox · Eric Skiff: Chibi Ninja … (CC BY 4.0) · …" (CC BY needs the credit on screen). */
export const MUSIC_CREDIT_LINE =
  "Music: " +
  ALL.map((t) => (t.license.startsWith("CC BY") ? `${t.artist}: ${t.title} (${t.license})` : t.artist))
    .filter((x, i, xs) => xs.indexOf(x) === i)
    .join(" · ");
