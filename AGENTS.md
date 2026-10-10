# Pump-Court AI Agent Directives & Architecture Map

> **Applies to**: All AI Agents (Google Antigravity, Gemini Coder, Claude Code, Cursor, Copilot)  
> **Workspace**: `Pump-Court`  
> **Last Verified**: 2026-10-10  

---

## 1. Prime Directives for Operating in this Repository

1. **The Source of Truth is `docs/`**:
   The `docs/` folder contains dedicated architectural guides for every feature split into isolated subdirectories. **Consult the relevant feature directory BEFORE making architectural or algorithmic modifications.**
2. **Strict Decoupling**:
   - `frontend/src/ui/` components **must never** invoke Tauri commands directly. Always use hooks in `frontend/src/logic/` and API bindings in `frontend/src/api/`.
   - The referee math (`pumpCourt/src/judge.ts`, `posture.ts`, `geometry.ts`, imported as `@tracker/*`) **must remain pure and deterministic** without direct database or GUI side-effects.
   - The `pump-court-engine` background thread must never be blocked by heavy computation or synchronization locks.
3. **Rust ➔ TypeScript Struct Synchronization**:
   Whenever you alter a struct in `backend/src/`, verify and update the corresponding interface in `frontend/src/api/types.ts`.
4. **Documentation Maintenance**:
   Whenever you modify an API, state machine, algorithm, or configuration parameter, update the relevant markdown document in `docs/features/<feature>/` in the same step.

---

## 2. Fast Navigation to Feature Documentation

| If you are working on... | Read this documentation folder first |
| :--- | :--- |
| Computer vision, landmarks, camera tracker | [`docs/features/pose-tracking/`](docs/features/pose-tracking/README.md) |
| Referee rules, angles, depth/lockout math | [`docs/features/referee-engine/`](docs/features/referee-engine/README.md) |
| Session states, game modes, engine thread | [`docs/features/game-engine/`](docs/features/game-engine/README.md) |
| Phone streaming, WebSockets, HTTPS, QR | [`docs/features/phone-camera/`](docs/features/phone-camera/README.md) |
| SQLite database, rankings, backups | [`docs/features/leaderboard/`](docs/features/leaderboard/README.md) |
| React screens, dual-window crowd display | [`docs/features/frontend-ui/`](docs/features/frontend-ui/README.md) |
| Tournament setup, venue layout, hotkeys | [`docs/features/venue-operations/`](docs/features/venue-operations/README.md) |
| Setup, testing, Rust guide, tracker C++ | [`docs/features/developer-guides/`](docs/features/developer-guides/README.md) |

---

## 3. High-Level System Architecture Summary

```text
Camera / Phone ──▶ App window (TypeScript, pumpCourt/src via @tracker)
                     ├── MediaPipe pose landmarks
                     ├── Posture ready check ──▶ set_ready
                     └── 3-Light Referee (Depth, Torso, Lockout) ──▶ report_rep
                                    │
                                    ▼
                   Engine Thread (Rust): round clock + score
                     ├── Tauri IPC Events ("tick", "rep", "round-finished")
                     │     ├── Operator Window (label "main")
                     │     └── Crowd Window (label "crowd")
                     └── SQLite Leaderboard: runs(name, mode, reps)
```

For complete system architecture and data contracts, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
