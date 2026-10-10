# Feature 06: Frontend Architecture & Dual-Screen UI

> **Module**: `frontend/src/`  
> **Key Types**: `App.tsx`, `useGameFlow`, `useRound`, `PoseView`, `tokens.css`  
> **Related Documents**: [State & Hooks](state-and-hooks.md), [Crowd Display Sync](crowd-display-sync.md), [Styling & Design Tokens](styling-and-tokens.md)  
> **Maintenance Status**: Active / User Experience Architecture  

---

## 1. Executive Summary

The Pump-Court frontend is built with **React 18, TypeScript, and Vite**, bundled into native OS windows by Tauri 2. 

The architecture strictly adheres to a **Decoupled Three-Tier Model**:
1. **API Tier (`frontend/src/api/`)**: Pure TypeScript bindings and type definitions mirroring the Rust backend.
2. **Logic Tier (`frontend/src/logic/`)**: React hooks encapsulating state machines, clocks, sound triggers, and IPC.
3. **UI Presentation Tier (`frontend/src/ui/` & `frontend/src/theme/`)**: Pure presentational screens and components driven by CSS custom properties (design tokens).

```text
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
│                                                             │
│   ui/screens/          ui/components/         theme/        │
│   ├── HomeScreen       ├── PoseView (Canvas)  ├── tokens.css│
│   ├── RoundScreen      ├── RefereeLights      └── styles.css│
│   ├── ResultsScreen    ├── ReadyChecklist                   │
│   └── CrowdScreen      └── PhoneLinkPanel                   │
└──────────────────────────────▲──────────────────────────────┘
                               │ State, Props & Handlers
┌──────────────────────────────┴──────────────────────────────┐
│                        LOGIC LAYER                          │
│                                                             │
│   useGameFlow.ts       useRound.ts            useCrowd.ts   │
│   useNameEntry.ts      useSettings.ts         useKeys.ts    │
└──────────────────────────────▲──────────────────────────────┘
                               │ Invocations & Event Listeners
┌──────────────────────────────┴──────────────────────────────┐
│                         API LAYER                           │
│                                                             │
│   api/backend.ts       api/types.ts           events.ts     │
└──────────────────────────────▲──────────────────────────────┘
                               │ Tauri IPC (invoke / listen)
                    [ Rust Backend Engine ]
```

---

## 2. Directory Layout & Invariants

| Directory | Role | Rule |
| :--- | :--- | :--- |
| `frontend/src/api/` | Contract with Rust backend | **Never call directly from UI components**. Only hooks call API. |
| `frontend/src/config/`| Menus, blurbs, keybindings | Edit freely without affecting core logic. |
| `frontend/src/logic/` | State machines & React hooks | Reusable by any UI replacement (Tailwind, Chakra, etc.). |
| `frontend/src/ui/` | Visual components & screens | Only displays props and calls hook actions. |
| `frontend/src/theme/` | CSS tokens & layout rules | Change colors, sizes, and fonts without touching TSX. |

---

## 3. The Dual-Window Multi-Monitor Pattern

Pump-Court renders two independent windows from the same application build:
- **Operator Console (`/`)**: Main window used by match referees and tournament staff to register athletes, view diagnostic angles, and select sources.
- **Crowd Stadium Display (`/#crowd`)**: High-contrast, billboard-style display meant for athletes, coaches, and spectators on external HDMI monitors or stadium projectors.
