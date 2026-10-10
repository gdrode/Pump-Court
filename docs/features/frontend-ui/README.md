# Feature 06: Frontend Architecture & Dual-Screen UI

> **Module**: `frontend/src/`  
> **Key Types**: `App.tsx`, `useGameFlow`, `useRound`, `useCrowd`, `TrackerProvider`, `Dragon`, `tokens.css`  
> **Related Documents**: [State & Hooks](state-and-hooks.md), [Crowd Display Sync](crowd-display-sync.md), [Styling & Design Tokens](styling-and-tokens.md)  
> **Maintenance Status**: Active / User Experience Architecture  

---

## 1. Executive Summary

The Pump Court frontend is built with **React 18, TypeScript and Vite**, shown in native windows by Tauri 2.

The look is the team's **sketchbook design**: paper background, ink lines, the bundled *Patrick Hand* font, hand-drawn borders, and an animated **dragon host** that reacts to every rep.

The **motion tracker and the referee run in the operator window**, not in Rust. `TrackerProvider` wraps the teammate's modules in `pumpCourt/src` (imported as `@tracker/…`). The Rust backend keeps the clock, the score and the leaderboard. See [Pose Tracking](../pose-tracking/README.md).

The code has three layers:
1. **API (`frontend/src/api/`)**: typed wrappers for the Rust commands and events, and the shared types.
2. **Logic (`frontend/src/logic/`)**: React hooks with all state, screen flow, backend calls, and the tracker.
3. **UI (`frontend/src/ui/` and `frontend/src/theme/`)**: screens and components. They show hook data and call hook actions. They never call Tauri directly.

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                               UI LAYER                                    │
│  ui/screens/           ui/components/              ui/ + theme/           │
│  ├── Home              ├── CameraView (video +     ├── host.ts (lines)    │
│  ├── Players           │   skeleton)               ├── hostMood.ts        │
│  ├── Round             ├── AddCameraDialog         ├── sounds.ts          │
│  ├── Results           ├── Dragon (SVG host)       ├── tokens.css         │
│  ├── DuelResult        ├── Lights (3 referees)     └── styles.css         │
│  ├── Leaderboard       ├── LeaderboardTable                               │
│  ├── Crowd             ├── KeyHints                                       │
│  └── Settings (Camera) └── SketchDefs (SVG filters)                       │
└─────────────────────────────────▲─────────────────────────────────────────┘
                                  │ state, props, handlers
┌─────────────────────────────────┴─────────────────────────────────────────┐
│                              LOGIC LAYER                                  │
│  useGameFlow  useRound  useNameEntry  useLeaderboard  useCrowd            │
│  useBoardRecord  useKeys  results.ts  events.ts                           │
│  tracker/: TrackerProvider  phoneLink.ts  usePhonePairing.ts              │
└─────────────────────────────────▲─────────────────────────────────────────┘
                                  │ invoke / listen / Channels
┌─────────────────────────────────┴─────────────────────────────────────────┐
│  API LAYER: api/backend.ts   api/types.ts                                 │
└─────────────────────────────────▲─────────────────────────────────────────┘
                                  │ Tauri IPC
                       [ Rust backend ]
```

---

## 2. Directory Layout & Rules

| Directory | Role | Rule |
| :--- | :--- | :--- |
| `frontend/src/api/` | Contract with the Rust backend | Only hooks call it, never UI components. |
| `frontend/src/config/` | Modes, labels, board tabs, home keys, `REFEREE_RULES`, crowd timings | Edit freely; screens read it. |
| `frontend/src/logic/` | Hooks, flow, tracker | Reusable by any new UI. |
| `frontend/src/ui/` | Screens, components, dragon lines, sounds | Only shows props and calls hook actions. |
| `frontend/src/theme/` | CSS tokens and layout | Change colors, sizes and fonts without touching TSX. |

`App.tsx` is the one place that picks a screen component for each flow state. To try a new design, point its imports at new components; hooks and API stay as they are.

### Screens
| Screen | File | Shows |
| :--- | :--- | :--- |
| Home | `ui/screens/Home.tsx` | Title with three lights, dragon. Two steps: a top bar **Singleplayer / Duel**, then the mode cards **Sprint / Marathon / Max** (dimmed until a play style is picked, then they light up). Under them a dashed **Create event** button: a placeholder for per-event leaderboards, shows "coming soon". Once a play style is picked the modes light up (Sprint purple, **Max red**, Marathon cream). The dragon says a different line each time the menu opens (`HOME_LINES` in `ui/host.ts`, in order, counted by `useGameFlow`'s `home()`). At the very bottom, next to the key hints, a small **Fixed camera** switch (key F): on = the camera stays for every player and scores post automatically. |
| Players | `ui/screens/Players.tsx` | Name entry: one name, or two for a Duel |
| Round | `ui/screens/Round.tsx` | Camera on the left (with **⟳ Rotate** until the clock runs). Side panel: get-ready checklist with a camera picker and **+ Add camera** (`ui/components/CameraPicker.tsx`), then the clock, score vs record (or "To beat" in a Duel), lights and dragon. 3-2-1 / GO overlay. |
| Duel round | `ui/screens/DuelRound.tsx` | Split screen for a two-camera Duel, cut in half top to bottom: player 1 on top, player 2 below. Each half: camera on the left (with **⟳ Rotate** until the clock runs), and on the right the score, lights and, before the clock, a camera picker with **+ Add camera** (`CameraPicker`). One clock in the top bar. The 3-2-1 covers the whole split screen, faded, and the layout never moves between phases (the note above and the "Take turns" button below keep their space). |
| Results | `ui/screens/Results.tsx` | Push-ups, why the round ended, whether it is posted (opt-in: "📱 Ana can post this from their phone", "✓ Posted"…), attempts, perfect, rank once posted, red lights per referee. Enter posts (unless the player said no on the phone), Esc discards. |
| Duel result | `ui/screens/DuelResult.tsx` | Both players in order, the winner or a tie, each score's post status, **P** posts the scores still waiting, rematch |
| Leaderboard | `ui/screens/Leaderboard.tsx` | Five tabs (All time, Sprint, Marathon, Max, Duel), select + delete, backup |
| Crowd | `ui/screens/Crowd.tsx` | Second window: live round, or the all-time board |
| Camera | `ui/screens/Settings.tsx` | Camera picture with **⟳ Rotate**, camera list, **Add camera**, tracking status, the player's posture (file and flow state are still called "settings") |

The **phone page** (what a phone camera shows) uses the same look: `frontend/scripts/build-phone.mjs` inlines the font, `tokens.css`, `styles.css`, the sketch filters and the dragon into it. See [The Phone Page](../phone-camera/mobile-web-client.md).

If the camera has a problem while another screen is showing, a red banner at the top says so; clicking it opens the Camera screen.

---

## 3. Two Windows

The same build runs in two windows:
- **Operator window** (label `main`): the operator picks modes, enters names, runs rounds and manages the board. The tracker runs here.
- **Crowd window** (label `crowd`): a big display for the player and the people watching. **W** on the home screen opens it (`open_crowd_window`). It loads the same `index.html`; `isCrowdWindow()` in `api/backend.ts` sees the label `crowd` (or a `#/crowd` hash in a plain browser) and renders only `<Crowd />`, without the tracker.

See [Crowd Display Sync](crowd-display-sync.md).

---

## 4. Sounds

- `ui/sounds.ts` plays `chime.mp3`, `buzzer.mp3` and `norep.mp3` from `frontend/public/sounds/` if they exist.
- Otherwise (and always for `beep`, `go` and `final`) a Web Audio tone plays. `norep` has no tone, since the buzzer already covers it.
- Until the mp3s are added, the console shows three harmless "file not found" messages at start-up.
