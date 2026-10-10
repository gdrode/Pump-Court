# Documentation Maintenance Rule

> **Trigger**: When editing code files in `backend/` or `frontend/`

When making code changes in this workspace:

1. **Feature Doc Alignment**:
   - Changes in `backend/src/judge/` must be reflected in `docs/features/referee-engine/`.
   - Changes in `backend/src/pose/` must be reflected in `docs/features/pose-tracking/`.
   - Changes in `backend/src/game/` must be reflected in `docs/features/game-engine/`.
   - Changes in `backend/src/phone/` must be reflected in `docs/features/phone-camera/`.
   - Changes in `backend/src/leaderboard.rs` must be reflected in `docs/features/leaderboard/`.
   - Changes in `frontend/src/` must be reflected in `docs/features/frontend-ui/`.

2. **Cross-Check Types**:
   - Ensure `frontend/src/api/types.ts` precisely mirrors all serializable Rust structs in `backend/src/`.

3. **Checklist Before Completing Tasks**:
   - Verify that test commands still pass: `cargo test` (in `backend/`).
   - Verify that documentation file links remain valid.
