# Feature 06: Frontend Architecture & Dual-Screen UI

> **Module**: `frontend/src/`  
> **Key Types**: `App.tsx`, `useGameFlow`, `useRound`, `useCrowd`, `Dragon`, `tokens.css`  
> **Related Documents**: [State & Hooks](state-and-hooks.md), [Crowd Display Sync](crowd-display-sync.md), [Styling & Design Tokens](styling-and-tokens.md)  
> **Maintenance Status**: Active / User Experience Architecture  

---

## 1. Executive Summary

The Pump-Court frontend is built with **React 18, TypeScript, and Vite**, bundled into native OS windows by Tauri 2.

The look is the team's **sketchbook design**: paper background, ink lines, the bundled *Patrick Hand* font, hand-drawn borders, and an animated **dragon host** that reacts to every rep.

The architecture follows a **Decoupled Three-Tier Model**:
1. **API Tier (`frontend/src/api/`)**: TypeScript bindings and types mirroring the Rust backend.
2. **Logic Tier (`frontend/src/logic/`)**: React hooks holding all state, screen flow and backend calls.
3. **UI Presentation Tier (`frontend/src/ui/` & `frontend/src/theme/`)**: Screens and components that only display hook data and call hook actions.

```text
┌───────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                           │
│                                                                       │
│  ui/screens/            ui/components/            ui/ + theme/        │
│  ├── Home               ├── Dragon (SVG host)     ├── host.ts (lines) │
│  ├── Players            ├── Lights (3 referees)   ├── hostMood.ts     │
│  ├── Round              ├── PoseView (canvas)     ├── sounds.ts       │
│  ├── Results            ├── KeyHints              ├── tokens.css      │
│  ├── VersusResult       ├── SketchDefs (filter)   └── styles.css      │
│  ├── Leaderboard        ├── LeaderboardTable                          │
│  ├── Crowd              ├── RecentTable                               │
│  └── Settings           ├── CrowdViewPicker                           │
│                         └── PhoneLinkPanel                            │
└──────────────────────────────▲────────────────────────────────────────┘
                               │ State, Props & Handlers
┌──────────────────────────────┴────────────────────────────────────────┐
│                             LOGIC LAYER                               │
│                                                                       │
│  useGameFlow   useRound   useNameEntry   useLeaderboard   useCrowd    │
│  useCrowdControl   usePhoneLink   useSettings   useKeys   results.ts  │
└──────────────────────────────▲────────────────────────────────────────┘
                               │ Invocations & Event Listeners
┌──────────────────────────────┴────────────────────────────────────────┐
│                              API LAYER                                │
│                                                                       │
│  api/backend.ts         api/types.ts           logic/events.ts        │
└──────────────────────────────▲────────────────────────────────────────┘
                               │ Tauri IPC (invoke / listen)
                    [ Rust Backend Engine ]
```

---

## 2. Directory Layout & Invariants

| Directory | Role | Rule |
| :--- | :--- | :--- |
| `frontend/src/api/` | Contract with Rust backend | **Never call directly from UI components**. Only hooks call the API. |
| `frontend/src/config/`| Modes, labels, keybindings, tab names | Edit freely without affecting core logic. |
| `frontend/src/logic/` | State machines & React hooks | Reusable by any UI replacement. |
| `frontend/src/ui/` | Screens, components, dragon lines, sounds | Only displays props and calls hook actions. |
| `frontend/src/theme/` | CSS tokens & layout rules | Change colors, sizes, and fonts without touching TSX. |

### Screens
| Screen | File | Shows |
| :--- | :--- | :--- |
| Home | `ui/screens/Home.tsx` | Title with three lights, dragon, the four mode cards |
| Players | `ui/screens/Players.tsx` | Name entry: one name, or 2–4 for Versus; team checkbox |
| Round | `ui/screens/Round.tsx` | Camera on the left; side panel with ready check, then clock, score vs best, lights, dragon; countdown overlay; "Run voided" overlay |
| Results | `ui/screens/Results.tsx` | Clean reps, attempts, accuracy, rank, no-reps per referee |
| Versus standings | `ui/screens/VersusResult.tsx` | Final order, winner or tie, rematch |
| Leaderboard | `ui/screens/Leaderboard.tsx` | Three boards, select + delete, backup, team toggle, crowd view controls |
| Crowd | `ui/screens/Crowd.tsx` | Second window: live round or boards / recent results |
| Settings | `ui/screens/Settings.tsx` | Camera source, phone QR link, referee thresholds |

---

## 3. The Dual-Window Multi-Monitor Pattern

Pump-Court renders two windows from the same application build:
- **Operator Console (`/`)**: Main window used by the operator to pick modes, enter names, run rounds and manage the board.
- **Crowd Display (`/#/crowd`)**: Large display for athletes and spectators on an external monitor or projector. Opened with **W** on the home screen.

---

## 4. Sounds

- `ui/sounds.ts` plays `chime.mp3`, `buzzer.mp3` and `norep.mp3` from `frontend/public/sounds/` if they exist.
- Until those files are added, synthesised Web Audio tones play instead.
- The browser console then shows three harmless "file not found" messages at start-up.
