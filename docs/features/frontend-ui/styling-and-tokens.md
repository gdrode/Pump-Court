# Design Tokens, Sketchbook Theme & PoseView Canvas Rendering

> **Module**: `frontend/src/theme/`, `frontend/src/ui/components/`  
> **Key Files**: `tokens.css`, `styles.css`, `SketchDefs.tsx`, `Dragon.tsx`, `PoseView.tsx`  
> **Related Documents**: [Frontend UI Overview](README.md), [Pose Tracking Overview](../pose-tracking/README.md)  
> **Maintenance Status**: Active / Design System  

---

## 1. Design Token System (`tokens.css`)

All colors, the font, corner shapes and skeleton colors are CSS custom properties in `frontend/src/theme/tokens.css`. A restyle starts there; no TSX changes are needed.

```css
:root {
  --paper: #f3ecd9;        /* page background */
  --card: #fffaf0;         /* panels and cards */
  --ink: #241f1a;          /* lines and text */
  --ink-soft: #6e665a;     /* secondary text */
  --faint: #d9cfb6;        /* dashed rules */
  --green: #4f9a3e;        /* the one accent (dragon green) */
  --green-light: #dcedc8;
  --cream: #f6e6ab;        /* hover / highlight */
  --red: #d2452e;          /* no-reps */
  --red-light: #f6d3c8;
  --font: 'Patrick Hand', 'Comic Neue', 'Chalkboard SE', 'Comic Sans MS', cursive;
  --r: 14px 22px 12px 20px / 20px 12px 22px 14px;  /* uneven, hand-drawn corners */

  /* Camera view and skeleton (read by PoseView) */
  --video-bg: #2b2620;
  --skeleton-bone: rgba(255, 250, 240, 0.92);
  --skeleton-bone-lost: rgba(210, 69, 46, 0.9);
  --skeleton-joint: #8fd17a;
  --skeleton-label: #f6e6ab;

  --qr-bg: #ffffff;        /* phone QR code background, keep light */
}
```

`styles.css` holds layout and animations and uses only these tokens.

---

## 2. Sketchbook Elements

- **Font**: `@fontsource/patrick-hand` is an npm package, bundled into the build. It works with no internet.
- **Hand-drawn borders**: any element with class `sketch` gets a border drawn by `.sketch::before`. `SketchDefs.tsx` renders the SVG filters `#rough` and `#rough-sm` once per window; they roughen the border edges.
- **Referee lights**: `Lights.tsx` draws one lamp per referee (depth, lockout, plank). White = pass, red = no-rep, dashed = waiting. A red lamp shows the measured angle and the needed angle.
- **Dragon host**: `Dragon.tsx` is an animated SVG. Moves are CSS animations in `styles.css` under "the dragon":
  - `curl` (dumbbell curls), `cheer` (jump), `sad` (head shake + sweat), `hype` (bouncing dance + sparkles), `hurry` (frantic), `wave`, `idle`.
  - The `beat` prop replays a one-shot move, e.g. on every rep.
- **Dragon lines**: all text the dragon says is in `ui/host.ts`.
- **Dragon reactions**: `ui/hostMood.ts` picks the move and line during a round (no-rep → sad, clean rep → cheer, passing the best → hype, last 5 s or a slow patch → hurry). The round screen and the crowd screen share it.
- **Reduced motion**: with the OS "reduce motion" setting on, all animations are switched off.

---

## 3. Real-Time Canvas Skeleton Rendering (`PoseView`)

`PoseView.tsx` draws the camera image and the skeleton on a `<canvas>` every `tick`.

1. **Background**: the latest `Tick.preview` JPEG (phone camera) if there is one; otherwise a plain `--video-bg` fill (mock athlete).
2. **Bones**: shoulders, arms, torso and legs on both sides, skipping points with visibility below 0.3. Bones turn `--skeleton-bone-lost` when tracking is lost.
3. **Joints**: dots on the 12 body points (`--skeleton-joint`).
4. **Angle labels**: live elbow, hip and knee angles next to the near-side joints (`--skeleton-label`).

The canvas reads the color tokens with `getComputedStyle`, so it follows the theme.
