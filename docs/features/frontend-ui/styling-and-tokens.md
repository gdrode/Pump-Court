# Design Tokens, Theming & PoseView Canvas Rendering

> **Module**: `frontend/src/theme/tokens.css`, `frontend/src/ui/components/PoseView.tsx`  
> **Key Files**: `tokens.css`, `styles.css`, `PoseView.tsx`, `pumpCourt/src/draw.ts`  
> **Related Documents**: [Frontend UI Overview](README.md), [Pose Tracking Overview](../pose-tracking/README.md)  
> **Maintenance Status**: Active / Design System  

---

## 1. Design Token System (`tokens.css`)

All visual styling—colors, surface contrasts, border radii, referee light dimensions, typography, and skeleton rendering colors—is parameterized as standard CSS Custom Properties in `frontend/src/theme/tokens.css`.

A developer or designer can completely transform the visual theme (e.g., light mode, high-contrast tournament theme, brand colors) without altering any React code or TSX components.

### Core Token Palette:
```css
:root {
  /* Surfaces & Backgrounds */
  --bg-app: #0f1117;
  --bg-surface: #1a1d26;
  --bg-surface-elevated: #242836;
  --border-subtle: rgba(255, 255, 255, 0.08);

  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --text-primary: #ffffff;
  --text-muted: #8e95a5;

  /* Referee Light Tokens */
  --light-size-operator: 48px;
  --light-size-crowd: 140px;
  --light-white-glow: rgba(255, 255, 255, 0.8);
  --light-red: #ff3b30;
  --light-red-glow: rgba(255, 59, 48, 0.8);

  /* Pose Skeleton Tokens */
  --skeleton-bone: #00e5ff;
  --skeleton-joint: #ffffff;
  --skeleton-depth-arc: #ffe600;
}
```

---

## 2. Real-Time Canvas Skeleton Rendering (`PoseView`)

`PoseView.tsx` renders the athlete's camera feed and anatomical skeleton overlay using an HTML5 `<canvas>` element at 60Hz.

### Rendering Pipeline:
1. **Background Video / Preview**:
   - If connected to local webcam: renders HTML5 `<video>` directly onto canvas.
   - If connected to phone camera / pushed frames: decodes base64 JPEG from `Tick.preview`.
2. **Skeleton Bones**:
   - Connects Shoulder ➔ Elbow ➔ Wrist.
   - Connects Shoulder ➔ Hip ➔ Knee ➔ Ankle.
   - Draws only the tracked side facing the camera (preventing confusing overlapping lines from the hidden limb).
3. **Joint Markers**:
   - Renders 4px circles on active joints.
4. **Depth Inflection Arc**:
   - Renders a dynamic colored angle arc around the tracked elbow vertex, visually illustrating current arm flexion compared to the 90° depth threshold.
