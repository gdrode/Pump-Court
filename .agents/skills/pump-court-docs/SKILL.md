---
name: pump-court-docs
description: >-
  Comprehensive guide and maintenance procedures for the Pump-Court documentation suite.
  Use this skill when reading, adding to, or maintaining technical documentation for Pump-Court,
  or when navigating its multi-feature architecture.
---

# Pump-Court Documentation Navigator & Maintenance Skill

Use this skill to navigate, query, and maintain the professional documentation folder in Pump-Court.

---

## 1. Directory Structure

The documentation folder is located at `docs/` and organized into isolated feature directories:

```text
docs/
├── README.md                      # Master portal and entry index
├── ARCHITECTURE.md                # End-to-end system data flow & thread model
├── AGENTS.md                      # AI agent directives & token conservation
└── features/
    ├── pose-tracking/             # MediaPipe landmarks, coordinates & mock athlete
    ├── referee-engine/            # 3-light referee, angles, segmentation & calibration
    ├── game-engine/               # Session states, game modes & 60Hz engine thread loop
    ├── phone-camera/              # Embedded Axum server, self-signed TLS, QR code & WS
    ├── leaderboard/               # SQLite database, rankings, tie-breakers & backups
    ├── frontend-ui/               # Decoupled React architecture, hooks & crowd display
    ├── venue-operations/          # Tournament setup, stage runbook & troubleshooting
    └── developer-guides/          # Local setup, tests, Rust guide & native C++ FFI
```

---

## 2. Reading Procedures for AI Agents

1. **Locate Feature Domain**: Match user intent to the corresponding directory in `docs/features/`.
2. **Read Feature README First**: Always read `docs/features/<feature>/README.md` before reading deep technical sub-documents.
3. **Verify Code Reality**: Check active source code in `backend/` or `frontend/` to confirm active implementations match documented contracts.

---

## 3. Maintenance Procedures

When new features are added or existing code is modified:

1. **New Technical Feature**:
   - Create a new directory under `docs/features/<new-feature>/`.
   - Add a `README.md` following the standard metadata header format (Module, Key Types, Related Documents, Maintenance Status).
   - Add sub-documents for deep-dive mechanisms.
   - Register the new feature in `docs/README.md` and `docs/AGENTS.md`.

2. **Modifying Existing Feature**:
   - Update the corresponding document in `docs/features/<feature>/`.
   - Update any changed mathematical constants, struct fields, or CLI options.
