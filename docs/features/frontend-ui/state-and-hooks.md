# Frontend State Machines & Custom React Hooks

> **Module**: `frontend/src/logic/`  
> **Key Hooks**: `useGameFlow`, `useRound`, `useNameEntry`, `useLeaderboard`, `useCrowd`, `useBoardRecord`, `useKeys`, `useSession`, `useTracker`  
> **Related Documents**: [Frontend UI Overview](README.md), [Crowd Display Sync](crowd-display-sync.md), [Pose Tracking](../pose-tracking/README.md)  
> **Maintenance Status**: Active / Logic Specification  

---

## 1. Screen Flow (`useGameFlow`)

`useGameFlow` decides which screen the operator window shows:

```typescript
export type FlowState =
  | { screen: "home" }
  | { screen: "names"; mode: MenuModeInfo }
  | { screen: "round"; plan: Plan; results: RoundResult[]; attempt: number }
  | { screen: "results"; plan: Plan; results: RoundResult[] }
  | { screen: "duelResult"; plan: Plan; results: RoundResult[] }
  | { screen: "leaderboard"; mode: RoundMode | null; highlight?: string } // null = all time
  | { screen: "settings" };                                               // the Camera screen
```

- `plan.players` holds one name, or two for a Duel.
- `results` holds the finished turns so far; its length is the current turn.
- `attempt` goes up on a redo, which gives the round screen a fresh start.

### Actions
| Action | From → To |
| :--- | :--- |
| `pickMode(mode)` | home → names |
| `start(players)` | names → round (turn 1) |
| `finishRound(result)` | round → results |
| `next(posted)` | results → next Duel turn, the Duel result, or (solo) the leaderboard on that mode with the player highlighted if posted, else home |
| `discard()` | results → solo goes home, a Duel redoes the turn (the screen throws the score away first) |
| `rematch()` | Duel result → turn 1 with the same players |
| `home()`, `leaderboard(mode?, highlight?)`, `settings()`, `openCrowd()` | navigation |

**Posting is opt-in** (`logic/scorePost.ts`): a finished round is not saved. `useRound` / `useDuelMatch` start a `ScorePost` for it with `startScorePost(result, tracker.releasePhone())`: if the round was filmed with a phone, the phone is taken out of the camera list (the next player pairs their own) and gets the stats with **Post my score / Don't post**. The Results screen's Enter posts (`post("host")`) unless the player already chose; Esc calls `discard()` (deletes the run if it was posted). `useScorePosts(results)` re-renders on every change. Details: [Scoring & Ranking](../leaderboard/scoring-and-ranking.md#4-posting-is-opt-in).

---

## 2. Live Round (`useRound`)

`useRound` starts the round on mount (`backend.startRound(mode, player)`) and cancels it if the screen closes early. It joins the tracker and the backend:

```text
tracker posture.ready / in-a-rep changes ─▶ backend.setReady(ready, inRep) ─▶ backend runs the 3-2-1 countdown and the failure checks
RepJudge.push(...) returns a rep ─▶ backend.reportRep(...) ─▶ counted while the clock runs
backend tick / rep / round-finished ─▶ useRound ─▶ Round screen
```

- When the phase becomes `running`, it creates a new `RepJudge(REFEREE_RULES)`. When the phase leaves `running`, it drops the judge. A push-up still in progress at the buzzer does not count.
- Every tracked frame feeds the judge `{ elbow, hip: angles.abdomen, knee, bodyOffset, depth: posture.height, shoulderY, ready }`. See [Referee Engine](../referee-engine/README.md).

```typescript
const round = useRound({
  mode: "sprint",
  player: "Alex G",
  onFinished: (result) => handleFinish(result),
  onRep: (rep) => playSound(rep),        // optional
  onCountdown: (secondsLeft) => beep(),  // optional, once per number
  onGo: () => go(),                      // optional
});
```

### What it returns
- `phase`: `"idle" | "getReady" | "countdown" | "running" | "finished"`.
- `posture`: the tracker's push-up position check, for the get-ready checklist.
- `countdownSeconds`: 3, 2, 1 during the countdown, else `null`.
- `points` (the score, one decimal), `reps` (valid push-ups), `attempts`, `perfect`, `streak` (perfect reps in a row), `multiplier`, `elapsedMs`.
- `remainingMs`: time left (Sprint, Marathon, Duel), else `null`.
- `failRemainingMs`: while running, time left before the player fails (stuck in a rep, or no push-up in time). The Round screen shows "Keep going! N" in the last 3 s.
- `lastRep`: the latest `RepVerdict` (lights and faults); `lastRepAt`: when it arrived.
- `cancel()`: stops the round without saving.

The get-ready checklist on the round screen has one row per posture state, in order: whole body side-on, near hand in view, down in position, knees off the floor (legs straight), hands on the floor, hold still. See [Ready Check](../referee-engine/ready-check-calibration.md).

---

## 3. Other Hooks

- **`useNameEntry(mode, onStart, activeEvent)`**: one or two names, the active field, errors. Solo at the active event (if it ranks the mode): `roles` / `role` / `cycleRole` (required pick when there are roles), `team` (optional, only with a team board for the mode), and `onStart(players, { tags, board })`. `cleanName` keeps letters, digits, spaces and `. _ -`, and caps at 12 (`NAME_MAX`). Before starting it rejects empty or duplicate names, then checks each with `backend.checkName` (the backend has the final say).
- **`useLeaderboard(initial)`**: one board (`BoardRef`: global mode or all time, an event's mode and role, or a team board), up to 50 player `rows` or team `teams`, `remove(row)`, `exportBackup()`, a `message` line.
- **`useEvents()` / `useActiveEvent()`** (`logic/useEvents.ts`): every event and the active one; reloads on `event-changed`. Also `useEventManager()` (Events screen), `useEventTeams(eventId)`, `useEventBoardCycle(event, limit)` (the event's boards in turn, every `EVENT_BOARD_MS` = 5 s; home card and crowd screen), `boardTitle`, `fetchBoard`, `eventTabs`, `allEventBoards`. **`useEventDraft(editing)`** (`logic/useEventDraft.ts`): the event form. See [Events](../leaderboard/events.md).
- **`useRound`** takes optional `tags` (`EventTags`) and puts them on the finished `RoundResult`, so posting it sends `eventId`, `role` and `team`.
- **`useBoardRecord(mode)`**: the top score on one mode's board, shown as "Record" during a solo round.
- **`useCrowd()`**: the crowd window's data. See [Crowd Display Sync](crowd-display-sync.md).
- **`useStreakFx.ts`**: `useStreakFx(streak, active)` → `{ tier, words }`. `tier` 0–4 drives the glow; `words` is set for `STREAK_WORDS_MS` (1.8 s) when a tier is reached (`kind: "up"`) or a multiplier streak breaks (`kind: "break"`, "lol..."). Nothing fires while `active` is false. Used by `ui/components/StreakFx.tsx`.
- **`results.ts`**: `rankResults` (points, then perfect), `duelOutcome` (order, winner or tie, `decidedOnPerfect`), `scoreToBeat` (the Duel "To beat" box).
- **`useKeys(bindings, enabled?)`**: keyboard shortcuts. Ignores key repeat. While typing in a text box only Enter, Escape and Alt combos count. Alt combos use the physical key (`"Alt+n"`). A handled key doesn't also type into the next screen.
- **`events.ts`**: `useBackendEvent(subscribe, handler)` listens to one backend event while mounted; `useSession()` returns the latest `tick` snapshot.

### Tracker hooks (`logic/tracker/`)
- **`useTracker()`**: cameras, `choose(key)`, `refreshDevices()`, `addPhone` / `removePhone`, `releasePhone()` (after a round: stop filming with the phone in use and hand back its open link), `cameraError`, `modelStatus`, `live` (posture and poses per second), `resetPosture()`, `attach(el)`, and the picture's turn: `rotation` (0/90/180/270), `rotationAuto`, `rotate()` (90° clockwise, kept per camera), `rotateAuto()` (back to the phone's own value).
- **`useTrackerFrames(cb)`**: calls `cb({ t, angles, posture })` for every tracked frame.
- **`usePhonePairing`**: the Add camera dialog's logic. See [Phone Cameras](../phone-camera/README.md).

---

## 4. Sounds (`frontend/src/ui/sounds.ts`)

`play(id)` plays an mp3 from `frontend/public/sounds/` if it exists, else a Web Audio tone. The round screen calls it:
- `chime`: valid push-up. `buzzer` + `norep`: no-rep. `beep`: each countdown number and each of the last five seconds. `go`: the clock starts. `final`: round over. `boom`: BRUTAL STREAK (1.5x). `lol`: a streak with a multiplier breaks (both from `StreakFx`).
