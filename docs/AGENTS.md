# AI Agent Operational Manual & Maintenance Protocol

> **Target**: AI coding assistants (Google Antigravity, Gemini Coder, Claude Code, Cursor, Copilot)  
> **Scope**: Finding your way around the repo and keeping the docs true  
> **Last Updated**: 2026-10-10  

---

## 1. Prime Directives for AI Agents

1. **Read the feature docs before editing code**:
   - Before editing `pumpCourt/src/judge.ts`, `posture.ts` or `pose.ts`, read [`features/referee-engine/README.md`](features/referee-engine/README.md).
   - Before editing camera or phone code (`frontend/src/logic/tracker/`, `backend/src/phone/`), read [`features/phone-camera/README.md`](features/phone-camera/README.md).
   - Before editing React screens or hooks, read [`features/frontend-ui/README.md`](features/frontend-ui/README.md).
2. **Keep the layers apart**:
   - Never call Tauri `invoke()` from `frontend/src/ui/`. IPC belongs in `frontend/src/api/backend.ts`, used by hooks in `frontend/src/logic/`.
   - Keep `pumpCourt/src/{geometry,pose,posture,judge}.ts` plain: no camera, DOM, React or backend calls. They must stay deterministic so tests and log replay work.
   - Never block the `pump-court-engine` thread. It only runs the round clock.
   - `pumpCourt/` is the teammate's code and is shared with their standalone prototype. The app imports it through the `@tracker/*` alias; do not copy it into `frontend/`.
3. **Keep Rust and TypeScript types in step**:
   - When you change a struct in `backend/src/game/session.rs`, `backend/src/leaderboard.rs`, `backend/src/phone/net.rs` or `backend/src/phone/tunnel.rs`, update `frontend/src/api/types.ts`.
4. **Keep docs current**:
   - When an API, struct, constant or flow changes, update the matching page in `docs/features/<feature>/` in the same change.

---

## 2. Progressive Disclosure Architecture

Read only as deep as the task needs:

```text
Level 1: System
 docs/README.md ─────────────── Index and stack summary
 docs/ARCHITECTURE.md ──────── What runs where, IPC contract

Level 2: Feature
 docs/features/<feature>/README.md ── Overview, key files, API

Level 3: Detail
 docs/features/<feature>/<topic>.md ── Algorithms, constants, protocols
```

### Navigation Cheat Sheet

| Task | Read first | Code |
| :--- | :--- | :--- |
| Referee thresholds, lights, fault text | `features/referee-engine/README.md` | `pumpCourt/src/judge.ts` (`DIFFICULTY`), `frontend/src/config/modes.ts` (`REFEREE_RULES`) |
| False or missed rep counts | `features/referee-engine/rep-segmentation.md` | `pumpCourt/src/judge.ts` (`SEGMENT`, `RepJudge`) |
| Ready check / "get in position" | `features/referee-engine/ready-check-calibration.md` | `pumpCourt/src/posture.ts` (`POSTURE`) |
| Camera choice, detection loop, model loading | `features/pose-tracking/README.md` | `frontend/src/logic/tracker/TrackerProvider.tsx`, `pumpCourt/src/landmarker.ts` |
| Round clock, phases, failure rules | `features/game-engine/README.md` | `backend/src/game/session.rs`, `mode.rs` |
| Adding or changing a mode | `features/game-engine/game-modes.md` | `backend/src/game/mode.rs`, `frontend/src/config/modes.ts` |
| Phone pairing, QR, relay | `features/phone-camera/pairing-and-websocket.md` | `backend/src/phone/mod.rs`, `server.rs`, `frontend/src/logic/tracker/phoneLink.ts` |
| Cloudflare tunnel | `features/phone-camera/internet-link.md` | `backend/src/phone/tunnel.rs` |
| Sideways phone picture, ⟳ Rotate | `features/pose-tracking/README.md` (§5) | `frontend/src/logic/tracker/TrackerProvider.tsx`, `frontend/src/ui/components/CameraView.tsx`, `pumpCourt/src/phone/main.ts` |
| Leaderboard queries or migration | `features/leaderboard/scoring-and-ranking.md` | `backend/src/leaderboard.rs` |
| Screens, theme | `features/frontend-ui/styling-and-tokens.md` | `frontend/src/theme/tokens.css`, `frontend/src/ui/` |

---

## 3. Documentation Maintenance Protocol

After a code change, run through this list:

```markdown
- [ ] Struct fields added or renamed in `backend/src/`?
  ↳ Update `frontend/src/api/types.ts` AND the feature README that shows the struct.
- [ ] `DIFFICULTY`, `SEGMENT` or `POSTURE` changed in `pumpCourt/src/`, or `REFEREE_RULES` in `frontend/src/config/modes.ts`?
  ↳ Update `features/referee-engine/` (README, rep-segmentation, ready-check-calibration). A new posture state also needs a row in `Round.tsx` (`STEPS`, `ORDER`) and in the operator runbook.
- [ ] Tauri command added to `backend/src/lib.rs`?
  ↳ Update `frontend/src/api/backend.ts`, `docs/ARCHITECTURE.md` §3.2 and the feature README.
- [ ] New screen, hook or key?
  ↳ Update `features/frontend-ui/state-and-hooks.md` and `features/venue-operations/operator-runbook.md`.
- [ ] Phone route, port or message changed?
  ↳ Update `features/phone-camera/pairing-and-websocket.md`.
```

Check that relative links in `docs/` still resolve after renaming or deleting a page.

---

## 4. Documentation File Header Standard

Every page in `docs/features/` starts like this:

```markdown
# Feature or Component Title

> **Module**: `backend/src/...` or `frontend/src/...` or `pumpCourt/src/...`  
> **Key Types**: `TypeName1`, `TypeName2`  
> **Related Documents**: [Link to related doc](path/to/doc.md)  
> **Maintenance Status**: Active / Core  

## Summary
Two plain sentences on what this part does.
```
