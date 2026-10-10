# AI Agent Operational Manual & Maintenance Protocol

> **Target**: AI Coding Assistants (Google Antigravity, Gemini Coder, Claude Code, Cursor, Copilot)  
> **Scope**: Repository-wide architectural comprehension, navigation, and documentation upkeep  
> **Last Updated**: 2026-10-10  

---

## 1. Prime Directives for AI Agents

When modifying, extending, or debugging the Pump-Court codebase, all AI agents **MUST** follow these rules:

1. **Consult Feature Docs Before Code Edits**:
   - Before editing files in `backend/src/judge/`, read [`docs/features/referee-engine/README.md`](features/referee-engine/README.md).
   - Before modifying camera or networking logic, read [`docs/features/phone-camera/README.md`](features/phone-camera/README.md).
   - Before altering React screens or hooks, read [`docs/features/frontend-ui/README.md`](features/frontend-ui/README.md).
2. **Preserve Decoupled Architectures**:
   - Never call Tauri `invoke()` directly from `frontend/src/ui/`. All IPC belongs in `frontend/src/api/` or custom hooks in `frontend/src/logic/`.
   - Never perform database I/O or GUI state mutation inside the referee engine (`backend/src/judge/`). Keep judging algorithms strictly pure and deterministic.
   - Never block the `pump-court-engine` thread. Any heavy computation must be scheduled on the async runtime or offloaded.
3. **Synchronize Type Definitions Across Boundaries**:
   - When modifying any struct in `backend/src/game/session.rs`, `backend/src/judge/tracker.rs`, or `backend/src/leaderboard.rs`, you **MUST** update the matching TypeScript interfaces in `frontend/src/api/types.ts`.
4. **Maintain Documentation Integrity**:
   - If an API, struct, configuration default, or architecture pattern changes, update the relevant `docs/features/<feature>/` markdown file in the same PR or response.
   - Do not allow docs to become stale snapshots.

---

## 2. Progressive Disclosure Architecture

To conserve context tokens, documentation is structured hierarchically. Agents should read only as deep as necessary for their immediate task:

```text
Level 1: System Level
 docs/README.md ─────────────── High-level sitemap, tech stack & repo layout
 docs/ARCHITECTURE.md ──────── High-level subsystem boundaries & data flow

Level 2: Feature Root
 docs/features/<feature>/README.md ── Component overview, key files & API surface

Level 3: Deep Technical Sub-Docs
 docs/features/<feature>/<topic>.md ── Detailed mathematical proofs, state machines, protocols
```

### Navigation Cheat Sheet for Agents

| Task You Are Working On | Primary Doc to Read First | Secondary Reference |
| :--- | :--- | :--- |
| Tuning referee thresholds or depth/lockout math | `docs/features/referee-engine/angles-and-biomechanics.md` | `backend/src/judge/config.rs` |
| Fixing false rep counts or double counting | `docs/features/referee-engine/rep-segmentation.md` | `backend/src/judge/tracker.rs` |
| Adding or modifying a game mode | `docs/features/game-engine/game-modes.md` | `backend/src/game/mode.rs` |
| Modifying the phone video stream or QR pairing | `docs/features/phone-camera/pairing-and-websocket.md` | `backend/src/phone/server.rs` |
| Altering leaderboard rankings or migrations | `docs/features/leaderboard/scoring-and-ranking.md` | `backend/src/leaderboard.rs` |
| Redesigning a screen or tweaking visual theme | `docs/features/frontend-ui/styling-and-tokens.md` | `frontend/src/theme/tokens.css` |
| Linking external C++ or WASM pose trackers | `docs/features/developer-guides/tracker-integration.md` | `docs/INTEGRATION.md` |

---

## 3. Documentation Maintenance Protocol

Whenever you perform a code modification, execute the following **Documentation Maintenance Checklist**:

```markdown
- [ ] Check if struct fields in `backend/src/` were added or renamed.
  ↳ If YES: Update `frontend/src/api/types.ts` AND `docs/features/<feature>/README.md`.
- [ ] Check if `JudgeConfig` defaults were tuned in `backend/src/judge/config.rs`.
  ↳ If YES: Update `docs/features/referee-engine/angles-and-biomechanics.md`.
- [ ] Check if a new Tauri IPC command was added to `backend/src/lib.rs`.
  ↳ If YES: Update `frontend/src/api/backend.ts`, `docs/ARCHITECTURE.md`, and the relevant feature README.
- [ ] Check if a new screen, hook, or keyboard shortcut was added to the UI.
  ↳ If YES: Update `docs/features/frontend-ui/state-and-hooks.md` and `docs/features/venue-operations/operator-runbook.md`.
```

---

## 4. Documentation File Header Standard

Every technical markdown file in `docs/features/` adheres to this metadata header standard. When authoring or revising documentation files, maintain this format:

```markdown
# Feature or Component Title

> **Module**: \`backend/src/...` or \`frontend/src/...\`  
> **Key Types**: \`TypeName1\`, \`TypeName2\`  
> **Related Documents**: [Link to related doc](path/to/doc.md)  
> **Maintenance Status**: Active / Core  

## Summary
A concise 2-sentence explanation of what this component accomplishes.
```
