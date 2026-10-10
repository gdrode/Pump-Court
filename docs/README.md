# Pump-Court Documentation Portal

> **Version**: 2.0  
> **Target Audience**: Human Software Engineers, Systems Operators, and AI Coding Agents  
> **Last Verified**: 2026-10-10  

Welcome to the definitive technical documentation for **Pump-Court**, a high-precision, software-judged push-up competition platform powered by computer vision, biomechanical heuristics, and a dual-screen tournament presentation engine.

---

## 🗺️ Documentation Directory Map

Every major architectural subsystem and technical feature is split into an isolated, dedicated directory containing standalone explanations, architectural diagrams, data contracts, and maintenance guidelines.

```text
docs/
├── README.md                            # 📍 You are here: Master Portal & Navigation Index
├── ARCHITECTURE.md                      # System Architecture & End-to-End Data Flow
├── AGENTS.md                            # AI Agent Operating Manual & Maintenance Protocol
└── features/
    ├── pose-tracking/                   # Feature 1: Vision Pipeline & Pose Ingestion
    │   ├── README.md                    # Core concepts, coordinate spaces & PoseSource trait
    │   ├── mediapipe-integration.md     # MediaPipe 33-landmark model, WASM & IPC ingestion
    │   └── mock-athlete.md              # Scripted kinematic generator for camera-less testing
    ├── referee-engine/                  # Feature 2: Biomechanical Judging & Rulebook
    │   ├── README.md                    # The 3-Light referee specification & verdicts
    │   ├── angles-and-biomechanics.md   # Elbow, hip, knee, and depth geometry calculations
    │   ├── rep-segmentation.md          # State machine, ascent/descent, anti-cheat hysteresis
    │   └── ready-check-calibration.md   # Plank hold detection & player-specific lockout tuning
    ├── game-engine/                     # Feature 3: Match Session State & Thread Loop
    │   ├── README.md                    # Session lifecycle & execution model
    │   ├── game-modes.md                # Sprint, Minute, Max, and Versus game modes
    │   └── engine-thread-loop.md        # Background thread, mpsc channels & 60Hz tick loop
    ├── phone-camera/                    # Feature 4: Zero-Install Wireless Video Bridge
    │   ├── README.md                    # Architecture: PhoneHub, Axum server & streaming
    │   ├── https-and-tls.md             # On-the-fly self-signed TLS & local IP discovery
    │   ├── pairing-and-websocket.md     # QR code handshake, session tokens & binary JPEGs
    │   └── mobile-web-client.md         # Embedded HTML5 camera client & WebRTC/WSS behavior
    ├── leaderboard/                     # Feature 5: Persistence & Scoring Engine
    │   ├── README.md                    # Embedded SQLite schema & ACID guarantees
    │   ├── scoring-and-ranking.md       # Category partitions, accuracy tie-breakers & ranks
    │   ├── name-validation.md           # Unicode normalization, length caps & content filter
    │   └── backup-and-recovery.md       # Hourly JSON snapshots & disaster recovery
    ├── frontend-ui/                     # Feature 6: React UI, Logic & Dual-Monitor Engine
    │   ├── README.md                    # Decoupled UI / Logic design architecture
    │   ├── state-and-hooks.md           # Custom React hooks (useRound, useGameFlow, etc.)
    │   ├── crowd-display-sync.md        # Multi-window Tauri broadcast & crowd display modes
    │   └── styling-and-tokens.md        # Design token system & HTML5 Canvas PoseView
    ├── venue-operations/                # Feature 7: Tournament Deployment & Runbook
    │   ├── README.md                    # Physical stage layout, camera geometry & lighting
    │   ├── operator-runbook.md          # Stage operator playbook, hotkeys & match flow
    │   └── troubleshooting.md           # Diagnostic matrix, dropped frames & network recovery
    └── developer-guides/                # Feature 8: Engineering Runbooks & Extensibility
        ├── README.md                    # Local setup, tooling & test suites
        ├── rust-backend-guide.md        # Rust idioms, concurrency, ownership & Tauri 2 IPC
        └── tracker-integration.md       # Route A (WASM/Frontend) vs Route B (Native C++)
```

---

## 🧭 Fast Reading Paths

Depending on your role or objective, read documents in the following order:

### For AI Coding Agents
1. Read [AGENTS.md](AGENTS.md) for reading heuristics, token conservation rules, and documentation update invariants.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand the interaction boundaries between Rust and React.
3. Consult the specific `features/<feature-name>/README.md` corresponding to the files you are modifying.

### For Game Operators & Venue Staff
1. Read [Venue Operations: Operator Runbook](features/venue-operations/operator-runbook.md).
2. Read [Phone Camera Setup](features/phone-camera/README.md) to pair athlete-facing smartphones.
3. Keep [Troubleshooting Matrix](features/venue-operations/troubleshooting.md) open during live events.

### For Frontend & UI Developers
1. Read [Frontend Architecture Overview](features/frontend-ui/README.md).
2. Read [State and Hooks Specification](features/frontend-ui/state-and-hooks.md).
3. Read [Crowd Display Synchronization](features/frontend-ui/crowd-display-sync.md).

### For Computer Vision & Algorithm Engineers
1. Read [Pose Tracking System](features/pose-tracking/README.md).
2. Read [Referee Engine: Angles & Biomechanics](features/referee-engine/angles-and-biomechanics.md).
3. Read [Rep Segmentation State Machine](features/referee-engine/rep-segmentation.md).

---

## ⚡ System Snapshot

| Subsystem | Primary Language / Framework | Primary Source Location | Key Responsibility |
| :--- | :--- | :--- | :--- |
| **Desktop Shell** | Rust / Tauri 2 | `backend/src/lib.rs` | Window lifecycle, permissions, local OS APIs |
| **Engine Thread** | Rust (`std::thread`, `mpsc`) | `backend/src/engine.rs` | 30–60Hz clock, frame ingestion, judging loop |
| **Referee Core** | Rust (Pure Maths) | `backend/src/judge/` | Angle calculation, segmentation, 3-light verdict |
| **Session Control**| Rust | `backend/src/game/` | Match state machine (Sprint, Minute, Max, Versus) |
| **Phone Gateway** | Rust / Axum / WebSockets | `backend/src/phone/` | Embedded HTTPS server, QR code pairing, binary stream |
| **Persistence** | Rust / SQLite (`rusqlite`) | `backend/src/leaderboard.rs`| Local database, validation, hourly JSON backups |
| **Frontend App** | TypeScript / React / Vite | `frontend/src/` | Dual UI: Operator console and Crowd stadium display |
| **Vision Prototype** | TypeScript / MediaPipe | `pumpCourt/src/` | Standalone browser prototype with MediaPipe WASM |
