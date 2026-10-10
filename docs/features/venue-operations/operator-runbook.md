# Stage Operator Tournament Playbook

> **Role**: Tournament Operator & Lead Referee  
> **Key Shortcuts**: `1`–`4` (Modes), `Enter` (Advance), `Esc` (Back/Cancel), `L` (Board), `S` (Camera), `W` (Crowd)  
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
   - For a phone, press **A** (**+ Add camera**). Tabs, in order:
     - **Phone · any network** (opens first): works on any network, even mobile data. Needs `cloudflared` and internet on the laptop, and about 5–10 s to start. Scan the QR code, tap **Start camera**, allow camera access (and motion access on iPhone). No certificate warning.
     - **Phone · same Wi-Fi (offline)**: keeps the video on the local network. Phone and laptop on the same Wi-Fi, or the laptop joined to the phone's hotspot. Scan the QR code. Accept the certificate warning once (Safari: *Show Details → visit this website*; Chrome: *Advanced → Proceed*). Tap **Start camera** and allow camera access. If the page never loads (venue Wi-Fi often blocks this), go back to **Phone · any network**.
     - **USB / system camera**: help text and **Refresh camera list**.
     - The dialog shows "✓ A phone reached this laptop", then "Connected", and closes. The phone is now "Phone 1" in the list and is the camera in use.
     - Close the dialog with **×** (keys are paused while it is open).
   - Phone on its side: the picture should turn upright by itself (the label on the picture reads e.g. "90° auto"). If the player still looks sideways or upside down, press **⟳ Rotate** on the picture until they are upright; **auto** goes back to the phone's own value. Rotate is also on the get-ready screen, until the clock runs.
   - Check the right-hand panel: **Tracking** says "ready (GPU)" or "ready (CPU)" with poses per second, and **Player** follows the person on the mat.
3. **Audio Check**: the countdown beeps, the chime (valid push-up) and the buzzer (no-rep) must be heard over the crowd.

The chosen system camera is remembered for next time. Phones must be paired again after a restart.

---

## 2. Match Workflow (per player)

```text
[ HOME ]
  │ 1 Sprint (30 s), 2 Minute (60 s), 3 Max (ends after 5 s without a valid push-up, 3 min cap),
  │ 4 Duel (2 players, 30 s each)
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
  ▼
[ COUNTDOWN ]  3 … 2 … 1 … GO  (beeps)
  ▼
[ LIVE ROUND ]
  │ Three lights on every rep: Depth, Torso, Lockout. 2 or 3 white = it counts; 3 = perfect.
  │ Red lights list the reason, e.g. "Not deep enough: shoulders dropped 22% of their height (needs 30%)".
  │ Depth = shoulders drop at least 30% of the player's own straight-arm height.
  │ A rep is judged as soon as the arms lock out again; collapsing to the floor is not a rep.
  │ Clock runs down; beeps in the last 5 s. Max: shows the seconds left to get the next push-up.
  │ Esc aborts (nothing saved).
  ▼
[ RESULTS ]
  │ Push-ups, attempts, perfect, rank, red lights per referee. Already saved.
  │ Enter: post (solo → leaderboard with the name highlighted; Duel → next player, then the winner).
  │ Esc: discard the score (Duel: redo this turn).
  ▼
[ DUEL RESULT ]  (Duel only)
  │ Most push-ups wins; perfect push-ups break a tie. R: rematch. Enter/Esc: menu.
```

If the player walks out of view during a round, nothing is voided: reps simply stop being judged until they're back. The clock keeps running.

---

## 3. Keys

| Key | Where | Action |
| :--- | :--- | :--- |
| **`←` / `→`** | Home | Singleplayer / Duel (the mode buttons light up once one is picked) |
| **`1`–`3`** | Home | Sprint, Minute, Max (for the picked play style) |
| **`E`** | Home | Create event (placeholder: "coming soon") |
| **`L`** | Home | Leaderboard |
| **`S`** | Home | Camera screen |
| **`W`** | Home | Open (or bring forward) the crowd window |
| **`A`** | Camera screen | Add camera |
| **`Enter`** | Players | Next name / start |
| **`Esc`** | Players, Camera screen | Back to home |
| **`Esc`** | Get ready, live round | Abort the round (not saved) |
| **`Enter`** / **`Esc`** | Results | Post / discard (Duel: redo turn) |
| **`R`** | Duel result | Rematch |
| **`Enter`** / **`Esc`** | Duel result, Leaderboard | Back to home |
| **`1`–`5`**, **`←` `→`** | Leaderboard | Tabs: All time, Sprint, Minute, Max, Duel |
| **`↑` `↓`** | Leaderboard | Select a row |
| **`Delete`** or **`Backspace`**, twice | Leaderboard | Delete the selected run |
| **`B`** | Leaderboard | Write a backup file |

The crowd window has no keys. Every key hint on screen is also a button.
