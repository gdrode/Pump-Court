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
- **Reduced motion**: with the OS "reduce motion" setting on, all animations and transitions are off.

---

## 3. The Camera View (`CameraView`)

`CameraView.tsx` gives the camera a place on screen. It does not draw anything itself:

1. On mount it calls `tracker.attach(element)`. `TrackerProvider` moves its single `<video>`, the rotated-picture canvas (`canvas.camera-view__frame`) and the overlay `<canvas>` into that element. Detection only runs while a view is attached. When the picture is turned (rotation not 0), the video is `hidden` and the frame canvas shows instead; `.camera-view__media [hidden]` keeps it out of sight.
2. The tracker draws the tracked side's skeleton on the overlay canvas each frame (`drawOverlay` from `@tracker/draw`).
3. On top, a note shows the camera error, a model error, or "Loading tracking…" until the pose model is ready.

4. With `rotatable`, a row at the bottom right (`.camera-view__rotate`, cream sketch boxes) shows the turn ("90° auto"), **⟳ Rotate** and, after a manual turn, **auto**.

The Round screen and the Camera screen each show one `CameraView`. The Camera screen is always `rotatable`; the Round screen only until the clock runs (`round.phase !== "running"`). See [Pose Tracking](../pose-tracking/README.md#5-picture-rotation).
