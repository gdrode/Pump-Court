# Events: Per-Event, Role and Team Leaderboards

> **Modules**: `backend/src/events.rs`, `frontend/src/logic/useEvents.ts`, `frontend/src/logic/useEventDraft.ts`, `frontend/src/ui/screens/Events.tsx`
> **Key Types**: `EventInfo`, `EventDraft`, `TeamRow` (Rust and `frontend/src/api/types.ts`), `EventTags`, `BoardRef`
> **Related Documents**: [Leaderboard README](README.md), [Scoring & Ranking](scoring-and-ranking.md), [Operator Runbook](../venue-operations/operator-runbook.md)

---

## 1. What an event is

An event is a named contest (for example a hackathon) with its own leaderboards. It's made on the **Events** screen (key **E** on the home screen):

| Part | What it does |
| :--- | :--- |
| **Name** | Up to 24 characters, same blocklist as player names. |
| **Leaderboards** | Which modes it ranks: Sprint, Marathon and/or Max. Each picked mode gets an **Everyone** board plus **one board per role**. **Duels never get event boards.** |
| **Roles** | Any number of labels (up to 16 characters each). Players pick one at name entry. Each role gets its own board in every picked mode. |
| **Team leaderboards** | "Create team leaderboard" for a mode; at most one per mode. Players type a team at name entry. |

- **One event is active at a time**, or none.
  - A new event becomes the active one.
  - The Events screen lists **No event** plus every event; click one (or press ↑ ↓) to make it active.
  - The active event is saved in the database (`settings` table), so it survives a restart.
- **Edit** changes the name, modes, roles and team boards. The id and the scores stay.
- **Delete** (click twice) removes the event. Its rounds stay on the global boards, untagged.

---

## 2. Playing at an event

- **Solo rounds only.** Name entry asks for more only when the active event ranks the picked mode (an individual or a team board):
  - **Role**: chips under the name, **required** when the event has roles and ranks this mode. **↑ ↓** pick it, even while typing.
  - **Team**: a text box (optional), shown only when the event has a team leaderboard for this mode. It suggests team names already used at the event.
- The round is posted (opt-in, as always) with `eventId`, `role` and `team` (`EventTags`).
  - They ride on the `RoundResult` in the frontend (`useRound` adds them), and `save_round` checks them:
    - the event must exist;
    - the role must be one of its roles (matched ignoring case);
    - the team name follows the player-name rules (16 characters max).
- **The score also goes on the global boards** (All time and the mode's board), as before.
- After posting, the operator lands on the event's board for that mode (or its team board), with the player highlighted.

---

## 3. Boards and ranking

| Board | Rows | Rule |
| :--- | :--- | :--- |
| Event · mode · Everyone | Players | Each player's best round in that mode at the event (same rule as global boards: ties go to whoever posted first). |
| Event · mode · Role | Players | The same, only rounds posted with that role. |
| Team · mode | Teams | **Sum of the members' best rounds (points)** in that mode. Members are the different names that posted with the team. Team names match ignoring case; the first spelling posted is shown. A tie goes to the team that reached its score first. |

- **Leaderboard screen**:
  - **Global / event** switch at the top (key **E**);
  - tabs per mode and per team board (keys **1–n**, ← →);
  - role chips: **Everyone** and each role (key **R**).
  - Delete works on player boards. To fix a team score, delete the player's run.
- **Board cycle** (`useEventBoardCycle` in `logic/useEvents.ts`): while an event is active, its boards are shown one after another, every `EVENT_BOARD_MS` (**5 s**, `config/modes.ts`). The order is each mode's Everyone board, then each role's board, then the team boards. Dots show where it is in the cycle, and it reloads when a score is posted.
  - **Home screen**: a small card right under the Events button (`ui/components/EventBoardCycle.tsx`, top 4). Clicking the card opens that board on the Leaderboard screen.
  - **Crowd screen** (gear menu → Crowd screen, or W): the same cycle, big, top 10. With no event it shows the all-time board as before.

---

## 4. Storage

```sql
CREATE TABLE events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    modes      TEXT NOT NULL,   -- JSON array, e.g. ["sprint","max"]
    roles      TEXT NOT NULL,   -- JSON array of role names
    team_modes TEXT NOT NULL    -- JSON array of modes with a team leaderboard
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);  -- 'active_event'

-- added to runs (empty for rounds not played at an event, and for old databases)
ALTER TABLE runs ADD COLUMN event_id INTEGER;
ALTER TABLE runs ADD COLUMN role TEXT;
ALTER TABLE runs ADD COLUMN team TEXT;
CREATE INDEX runs_by_event ON runs(event_id, mode, points DESC);
```

`events::init` runs on every start and only adds what is missing. Backups include `event_id`, `role` and `team` for each run.

---

## 5. Commands and events

| Command | Returns |
| :--- | :--- |
| `list_events` | `EventInfo[]`, newest first (`active` set on one) |
| `get_active_event` | `EventInfo \| null` |
| `save_event(event: EventDraft)` | `EventInfo`. `id: null` creates it and makes it active. |
| `delete_event(eventId)` | Its runs are untagged, not deleted. |
| `set_active_event(eventId \| null)` | |
| `get_event_board(eventId, mode, role \| null, limit)` | `LeaderboardRow[]` |
| `get_team_board(eventId, mode, limit)` | `TeamRow[]` (`rank, team, reps, members`) |
| `get_event_teams(eventId)` | Team names used at the event |

`save_event`, `delete_event` and `set_active_event` emit **`event-changed`**, so the operator and crowd windows update at once (`useEvents` listens).

Tests: `cargo test events::` (creation and cleaning, edit, refused drafts, role boards, team sums, tag checks, new columns).
