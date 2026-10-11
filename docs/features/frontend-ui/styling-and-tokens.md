# Design Tokens, Sketchbook Theme & the Camera View

> **Module**: `frontend/src/theme/`, `frontend/src/ui/components/`  
> **Key Files**: `tokens.css`, `styles.css`, `SketchDefs.tsx`, `Dragon.tsx`, `Lights.tsx`, `CameraView.tsx`  
> **Related Documents**: [Frontend UI Overview](README.md), [Pose Tracking Overview](../pose-tracking/README.md)  
> **Maintenance Status**: Active / Design System  

---

## 1. Design Tokens (`tokens.css`)

All colors, the font and the corner shape are CSS custom properties in `frontend/src/theme/tokens.css`. A restyle starts there; no TSX changes are needed.

```css
:root {
  --paper: #f3ecd9;        /* page background */
  --card: #fffaf0;         /* panels and cards */
  --ink: #241f1a;          /* lines and text */
  --ink-soft: #6e665a;     /* secondary text */
  --faint: #d9cfb6;        /* dashed rules */
  --purple: #6b3fd4;       /* main accent (Knight Hacks purple): buttons, picks, highlights, eyebrow underline */
  --purple-light: #e4dbf8; /* picked buttons, "you" rows, the splash behind the dragon */
  --green: #4f9a3e;        /* means "good": ready ticks, posted, valid */
  --green-light: #dcedc8;
  --cream: #f6e6ab;        /* hover / highlight */
  --red: #d2452e;          /* no-reps */
  --red-light: #f6d3c8;
  --gold: #c9971c;         /* podium: 1st (leaderboard row, medal, trophy) */
  --gold-light: #f8e39a;
  --silver: #8e959c;       /* podium: 2nd */
  --silver-light: #e3e6e9;
  --bronze: #b06a35;       /* podium: 3rd */
  --bronze-light: #f0d2b6;
  --font: 'Patrick Hand', 'Comic Neue', 'Chalkboard SE', 'Comic Sans MS', cursive;
  --r: 14px 22px 12px 20px / 20px 12px 22px 14px;  /* uneven, hand-drawn corners */
  --video-bg: #2b2620;     /* behind the camera picture */
  --qr-bg: #ffffff;        /* phone QR code background, keep light */
}
```

`styles.css` holds layout and animations and uses only these tokens. The dragon's bandana uses the same purple (`BAND` in `ui/components/Dragon.tsx`); the dragon itself stays green. The skeleton colors are **not** tokens: the skeleton is drawn by the tracker's own `pumpCourt/src/draw.ts`.

---

## 2. Sketchbook Elements

- **Font**: `@fontsource/patrick-hand` is an npm package, bundled into the build. It works with no internet.
- **Hand-drawn borders**: any element with class `sketch` gets a border drawn by `.sketch::before`. `SketchDefs.tsx` renders the SVG filters `#rough` and `#rough-sm` once per window; they roughen the edges.
- **Referee lights**: `Lights.tsx` draws one lamp per referee: **Depth, Torso, Lockout** (names and order from `@tracker/judge`). White = pass, red = fault, empty = waiting. Under the lamps, a list of the faults, e.g. "Not deep enough: elbows only bent to 104° (needs 95°; hands not visible)". The crowd window hides that list. A new `flashKey` re-flashes the lamps even when two reps get the same calls.
- **Dragon host**: `Dragon.tsx` is an animated SVG with a speech bubble. Moves are CSS animations in `styles.css`:
  - `curl` (dumbbell curls), `cheer` (jump), `sad` (head shake + sweat), `hype` (bouncing dance + sparkles), `hurry` (frantic), `wave`, `idle`.
  - The `beat` prop replays a one-shot move, e.g. on every rep.
- **Dragon lines**: all text the dragon says is in `ui/host.ts`.
- **Dragon reactions**: `ui/hostMood.ts` picks the move and line during a round: no-rep → sad (and names the red light), just passed the best → hype, last five seconds → hurry, valid rep → cheer (hype when ahead), no rep for 2.5 s → hurry. The round screen and the crowd window share it.
- **Podium rows**: `LeaderboardTable` and `TeamTable` give ranks 1–3 the classes `is-podium is-gold` / `is-silver` / `is-bronze`: the row is tinted (`--gold-light` …), has a coloured left edge, and the rank sits in a medal disc (`.board__rank`). Applies everywhere the tables are used: Leaderboard screen, crowd board, event board cycle. The "← you" row keeps its podium colour.
- **Home decoration** (all `aria-hidden`, no clicks):
  - **Court floor** (`ArenaFloor` in `ui/components/Arena.tsx`): wooden boards in perspective, centre circle and lines along the bottom of the screen (fixed, behind the menu: `.home` is its own layer, the floor is `z-index: -1`).
  - **Mat** (`ArenaMat`): a purple exercise mat under the home dragon's feet (`.home__stage`).
  - **Trophy shelf** (`ui/components/TrophyShelf.tsx`): top-right, "Hall of fame", gold / silver / bronze trophies in podium order (2nd, 1st, 3rd) with the all-time top 3 names and points, "???" while a place is empty. Data from `useTopThree()` (`logic/useTopThree.ts`: `get_leaderboard(null, 3)`, reloads on `round-posted` and `leaderboard-reset`). Hidden below 900 px wide or 560 px tall.
- **Dragon cameos** (`ui/components/DragonCameo.tsx`, `pose` + `place`): a small dragon head and paws peeking over an edge.
  - Home: `lift` (pumping a dumbbell), from the right edge of the screen (hidden below 900 px).
  - Leaderboard: `sleep` (eyes shut, breathing, floating "z z Z"), resting on top of the panel.
  - Results: `cheer` (paws up, sparkles, bounce), up from the bottom-left; not shown on a 0-point round.
- **Reduced motion**: with the OS "reduce motion" setting on, all animations and transitions are off.

---

## 3. The Camera View (`CameraView`)

`CameraView.tsx` gives the camera a place on screen. It does not draw anything itself:

1. On mount it calls `tracker.attach(element)`. `TrackerProvider` moves its single `<video>`, the rotated-picture canvas (`canvas.camera-view__frame`) and the overlay `<canvas>` into that element. Detection only runs while a view is attached. When the picture is turned (rotation not 0), the video is `hidden` and the frame canvas shows instead; `.camera-view__media [hidden]` keeps it out of sight.
2. The tracker draws the tracked side's skeleton on the overlay canvas each frame (`drawOverlay` from `@tracker/draw`).
3. On top, a note shows the camera error, a model error, or "Loading tracking…" until the pose model is ready.

4. With `rotatable`, a row at the bottom right (`.camera-view__rotate`, cream sketch boxes) shows the turn ("90° auto"), **⟳ Rotate** and, after a manual turn, **auto**.

The Round screen and the Camera screen each show one `CameraView`. The Camera screen is always `rotatable`; the Round screen only until the clock runs (`round.phase !== "running"`). See [Pose Tracking](../pose-tracking/README.md#5-picture-rotation).

## Logo

`ui/components/Logo.tsx` draws "Pump Court" on the home screen (centered, above both columns) and the crowd screen (`variant="crowd"`, 9vh). Styles are under `/* ---- logo` in `styles.css`:
- **Letters**: each letter is its own span.
  - "Pump" is white and "Court" is `--purple`.
  - Every letter gets a thick ink outline (`-webkit-text-stroke` with `paint-order: stroke fill`) and a hard ink offset shadow.
  - Letters tip ±4° in turn (`--tilt`) and bob gently (`logo-bob`, staggered by the letter index `--i`).
  - A letter pops when hovered.
- **Lights**: the three referee lights are white lamps with an ink rim. They glow one after another (`logo-lamp`), with a white and `--purple-light` glow.
- **Sparkle**: a small ✦ in `--cream` twinkles above "Court".
- **Size**: `clamp(3.2rem, 4.2vw + 1.6rem, 6.4rem)`. Under 640 px it wraps to two lines. Reduced motion stops all the animations.
