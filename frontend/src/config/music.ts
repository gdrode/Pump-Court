// Background music. Files go in frontend/public/music/ (see the README there).
// Toby Fox's tracks go in public/music/toby/, which git ignores: they are
// copyrighted (he lets people use them, but they aren't openly licensed), so
// they are copied onto the event laptop by hand and never pushed. A missing
// file is skipped; with none, the game is silent.

export interface Track {
  /** URL under public/. */
  file: string;
  title: string;
  artist: string;
  /** Shown in the credits. */
  license: string;
  /** Where to get it. */
  url: string;
}

/** Home and every other screen between rounds: shuffled, one after another. */
export const MENU_TRACKS: Track[] = [
  {
    file: "/music/toby/field-of-hopes-and-dreams.mp3",
    title: "Field of Hopes and Dreams (Deltarune)",
    artist: "Toby Fox",
    license: "© Toby Fox, used with his blessing",
    url: "https://tobyfox.bandcamp.com/album/deltarune-chapter-1-ost",
  },
  {
    file: "/music/chibi-ninja.mp3",
    title: "Chibi Ninja (Resistor Anthems), EricSkiff.com/music",
    artist: "Eric Skiff",
    license: "CC BY 4.0",
    url: "https://ericskiff.com/music/",
  },
  {
    file: "/music/pixel-peeker-polka-faster.mp3",
    title: "Pixel Peeker Polka - faster",
    artist: "Kevin MacLeod, incompetech.com",
    license: "CC BY 4.0",
    url: "https://incompetech.com/music/royalty-free/music.html",
  },
];

/** During a round (get ready, countdown and the clock): one picked at random, looped. */
export const GAME_TRACKS: Track[] = [
  {
    file: "/music/toby/rude-buster.mp3",
    title: "Rude Buster (Deltarune)",
    artist: "Toby Fox",
    license: "© Toby Fox, used with his blessing",
    url: "https://tobyfox.bandcamp.com/album/deltarune-chapter-1-ost",
  },
  {
    file: "/music/level-3.m4a",
    title: "Level 3 (Retro Game Music Pack)",
    artist: "Juhani Junkala",
    license: "CC0",
    url: "https://opengameart.org/content/5-chiptunes-action",
  },
];

/** From the first streak tier (1.2x) until the streak breaks. Replaces the game track, which resumes after. */
export const STREAK_TRACK: Track = {
  file: "/music/toby/megalovania.mp3",
  title: "MEGALOVANIA (Undertale)",
  artist: "Toby Fox",
  license: "© Toby Fox, used with his blessing",
  url: "https://tobyfox.bandcamp.com/album/undertale-soundtrack",
};

/** Streak track speed per tier (0 = none … 4 = 1.5x): it gets faster, same pitch. */
export const STREAK_MUSIC_RATE = [1, 1, 1.04, 1.08, 1.12];

/** Music volume 0–1 until the operator changes it (gear menu). Sound effects stay louder. */
export const MUSIC_VOLUME_DEFAULT = 0.35;
/** Fades, ms. Only one track is ever heard: the old one fades out fully, then the next fades in. */
export const MUSIC_FADE_IN_MS = 800;
export const MUSIC_FADE_OUT_MS = 400;
/** A broken streak: the streak track cuts this fast, and the game track comes back after the "lol...". */
export const STREAK_CUT_MS = 150;
export const STREAK_RESUME_MS = 1_200;
