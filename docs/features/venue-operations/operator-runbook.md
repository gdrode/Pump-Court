# Stage Operator Tournament Playbook

> **Role**: Tournament Operator & Lead Referee  
> **Key Shortcuts**: `←`/`→` (Singleplayer/Duel), `1`–`3` (Modes), `Enter` (Advance), `Esc` (Back/Cancel), `L` (Board), `S` (Camera), `W` (Crowd), `F` (Fixed camera); the same links are in the ⚙ gear menu, top right  
> **Related Documents**: [Venue Operations Overview](README.md), [Troubleshooting Matrix](troubleshooting.md), [Phone Cameras](../phone-camera/README.md)  
> **Maintenance Status**: Active / Match Day Runbook  

---

## 1. Pre-Event Checklist (15 minutes before)

1. **Power & Displays**:
   - Plug the laptop into power; turn off sleep and screen savers.
   - Connect the crowd monitor or projector.
   - Start the app: `scripts\launch.cmd` (Windows), `./scripts/launch.sh` (macOS/Linux), or the built `pump-court` program.
   - Press **W** on the home screen to open the crowd window. Drag it onto the second screen and make it full screen (F11 / Cmd+Ctrl+F).
2. **Camera**:
   - Press **S** to open the **Camera** screen. The camera list shows the computer's cameras (USB webcams appear by themselves). Click one to use it.
   - For a phone, press **A** (**+ Add camera**). Two tabs:
     - **Phone (any network)** (opens first): works on any network, even mobile data. Needs `cloudflared` and internet on the laptop, and about 5–10 s to start. Scan the QR code, tap **Start camera**, allow camera access (and motion access on iPhone). No certificate warning.
     - **USB / system camera**: help text and **Refresh camera list**.
     - The dialog shows "✓ A phone reached this laptop", then "Connected", and closes. The phone is now "Phone 1" in the list and is the camera in use.
     - Close the dialog with **×** (keys are paused while it is open).
   - Phone on its side: the picture should turn upright by itself (the label on the picture reads e.g. "90° auto"). If the player still looks sideways or upside down, press **⟳ Rotate** on the picture until they are upright; **auto** goes back to the phone's own value. Rotate is also on the get-ready screen, until the clock runs.
   - Check the right-hand panel: **Tracking** says "ready (GPU)" or "ready (CPU)" with poses per second, and **Player** follows the person on the mat.
3. **Audio Check**: the countdown beeps, the chime (valid push-up) and the buzzer (no-rep) must be heard over the crowd.

The chosen system camera is remembered for next time. Phones must be paired again after a restart, **and after every round**: a phone camera is let go when its round ends, so each player can film with their own phone and see their stats on it.

**Fixed camera** (press **F** on the home screen, or the switch in the gear menu, top right): use it when one camera or phone stays mounted for everyone. When on, the camera is kept after each round and every score goes on the leaderboard automatically, without asking. The setting is remembered on this laptop.

---

## 2. Match Workflow (per player)

```text
[ HOME ]
  │ ← Singleplayer / → Duel, then 1 Sprint (30 s), 2 Marathon (60 s), 3 Max (no time limit)
  │ Every mode ends early when the player fails: out of position 2 s, stuck in a rep,
  │ or no push-up for 4 s (+0.25 s per rep, up to 6 s Sprint / 8 s Marathon / 10 s Max)
  ▼
[ PLAYERS ]
  │ Type the name (max 12 characters). Duel: two names; Enter moves to the next empty one.
  │ Enter starts. Esc goes back.
  ▼
[ GET READY ]  (camera on the left, checklist on the right)
  │ ✓ Whole body in view, side-on
  │ ✓ Near hand in view
  │ ✓ Down in the push-up position
  │ ✓ Knees off the floor, legs straight
  │ ✓ Hands on the floor, under the shoulders
  │ ✓ Hold still at the top, arms straight
  │ All rows ticked → countdown starts by itself. Knee push-ups never count.
  │ Picture sideways? ⟳ Rotate (bottom right of the camera picture).
  │ Wrong camera, or the player brought their phone? Camera list + "+ Add camera" under the checklist.
  ▼
[ COUNTDOWN ]  3 … 2 … 1 … GO  (beeps)
  ▼
[ LIVE ROUND ]
  │ Three lights on every rep: Depth, Torso, Lockout. 2 or 3 white = it counts; 3 = perfect.
  │ Red lights list the reason, e.g. "Not deep enough: shoulders dropped 22% of their height (needs 30%)".
  │ Depth = shoulders drop at least 30% of the player's own straight-arm height.
  │ A rep is judged as soon as the arms lock out again; collapsing to the floor is not a rep.
  │ Clock runs down; beeps in the last 5 s. "Keep going! 3…" shows just before a fail.
  │ Esc aborts (nothing saved).
  ▼
[ RESULTS ]
  │ Push-ups, why the round ended, attempts, perfect, red lights per referee.
  │ NOT saved yet: posting is opt-in. A phone camera now shows the player their stats with
  │ "Post my score" / "Don't post" (the phone stops filming and leaves the camera list).
  │ Enter: post (unless the player chose "Don't post" on their phone), then solo → leaderboard
  │ with the name highlighted; Duel → next player, then the winner.
  │ Esc: discard the score (Duel: redo this turn).
  ▼
[ DUEL RESULT ]  (Duel only)
  │ Most push-ups wins; perfect push-ups break a tie. Each score shows "✓ posted" or "not posted".
  │ P: post the scores still waiting. R: rematch. Enter/Esc: menu.
```

If the player walks out of view or stands up for 2 s during a round, their round ends ("Got up out of position") and the score so far is saved.

**Duel**: with two cameras, both players go at once on a split screen (player 1 on top). Pick each player's camera on their half (or **+ Add camera** for a phone). The 3-2-1 starts when both are in position and never stops once started (it covers the screen, faded). Esc stops the duel; the scores so far go to the Duel result. One camera? Press **Only one camera? Take turns instead**: the old turn-by-turn flow (results screen per player, then the winner).

---

## 3. Keys

| Key | Where | Action |
| :--- | :--- | :--- |
| **`←` / `→`** | Home | Singleplayer / Duel (the mode buttons light up once one is picked) |
| **`1`–`3`** | Home | Sprint, Marathon, Max (for the picked play style) |
| **`E`** | Home | Create event (placeholder: "coming soon") |
| **`F`** | Home | Fixed camera on/off (switch in the gear menu, top right) |
| **`L`** | Home | Leaderboard |
| **`S`** | Home | Camera screen |
| **`W`** | Home | Open (or bring forward) the crowd window |
| **`A`** | Camera screen | Add camera |
| **`Enter`** | Players | Next name / start |
| **`Esc`** | Players, Camera screen | Back to home |
| **`Esc`** | Get ready, live round | Abort the round (not saved) |
| **`Enter`** / **`Esc`** | Results | Post (opt-in) and continue / discard (Duel: redo turn) |
| **`P`** | Duel result | Post the scores still waiting |
| **`R`** | Duel result | Rematch |
| **`Enter`** / **`Esc`** | Duel result, Leaderboard | Back to home |
| **`1`–`5`**, **`←` `→`** | Leaderboard | Tabs: All time, Sprint, Marathon, Max, Duel |
| **`↑` `↓`** | Leaderboard | Select a row |
| **`Delete`** or **`Backspace`**, twice | Leaderboard | Delete the selected run |
| **`B`** | Leaderboard | Write a backup file |

Modes are picked by clicking their card (or keys `1`–`3`); the cards no longer show the number badges.

**Gear menu (⚙, top right):** hover or click it and it slides open to the left with **Leaderboard**, **Camera settings**, **Crowd screen** and the **Fixed camera** switch. It shows on every screen except the get-ready/live round (single or duel) and the results. On the home screen the items show their keys (L, S, W, F).

The crowd window has no keys. Every key hint on screen is also a button.
