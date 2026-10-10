# Stage Operator Tournament Playbook

> **Role**: Tournament Operator & Lead Referee  
> **Key Shortcuts**: `1`–`4` (Modes), `Enter` (Advance), `Esc` (Back/Cancel), `L` (Board), `S` (Settings), `W` (Crowd)  
> **Related Documents**: [Venue Operations Overview](README.md), [Troubleshooting Matrix](troubleshooting.md)  
> **Maintenance Status**: Active / Match Day Runbook  

---

## 1. Pre-Event System Checklist (15 Minutes Before Event)

1. **Power & Displays**:
   - Plug tournament laptop into AC power (disable OS sleep / screen savers).
   - Connect HDMI cable to crowd display / projector.
   - Boot desktop app: `scripts/launch.cmd` (Windows), `./scripts/launch.sh` (macOS/Linux), or the built `pump-court` program.
   - Press **W** on Home screen to spawn the Crowd window. Drag it onto the external projector and press Fullscreen (F11 / Cmd+Ctrl+F).
2. **Camera Link**:
   - Turn on the smartphone's **Wi-Fi Hotspot** or connect laptop and phone to venue router.
   - On the laptop, press **S** ➔ **Phone Camera**.
   - With the phone's camera app, scan the displayed QR code.
   - On phone: tap *Advanced ➔ Proceed*.
   - Tap **Start Camera**. Confirm the laptop settings screen reports: `Connected: 960x540 at 30 fps`.
   - Click **Use phone camera** on the laptop.
3. **Audio Check**:
   - Verify external PA speakers or laptop volume is set to a crisp level. Sound effects (countdown beeps, clean rep chime, no-rep buzzer) must be audible to athletes above crowd noise.

---

## 2. Match Execution Workflow (Per Athlete)

```text
[ HOME SCREEN ]
  │ Operator presses 1 (Sprint), 2 (Minute), 3 (Max), or 4 (Versus)
  ▼
[ PLAYERS ]
  │ Operator types athlete's name (max 12 chars). Versus: 2–4 names, Alt+N adds one.
  │ Toggle 'Team' (Alt+T) if applicable. Operator presses Enter.
  ▼
[ READY CHECK ]
  │ Athlete steps onto mat, assumes side-on top plank position.
  │ System verifies FPS (>=24), full visibility, and holds plank for 1 second.
  │ Lockout angle calibrates automatically.
  ▼
[ COUNTDOWN ]
  │ 3-second audible countdown sounds: 3... 2... 1... GO!
  ▼
[ LIVE MATCH ]
  │ Athlete performs push-ups.
  │ Three referee lights fire on every rep (chime for a clean rep, buzzer for a no-rep).
  │ The dragon host cheers clean reps and calls out no-reps.
  │ Clock runs down to zero (or 5s idle in Max mode).
  │ Tracking lost > 0.5 s: run voided, nothing saved. Press R to restart, Esc for menu.
  ▼
[ RESULTS SCREEN ]
  │ Final score, accuracy, rank and no-reps per referee.
  │ Score already saved to the SQLite leaderboard.
  │ Enter: post (solo → leaderboard; Versus → next player or standings).
  │ Esc: discard the score (Versus: redo the turn).
```

---

## 3. Quick Reference Keyboard Hotkeys

| Key | Context | Action |
| :--- | :--- | :--- |
| **`1`** | Home Screen | Select Sprint Mode (30s) |
| **`2`** | Home Screen | Select Minute Mode (60s) |
| **`3`** | Home Screen | Select Max Reps Mode (Sudden Death) |
| **`4`** | Home Screen | Select Versus Mode (2–4 players take turns) |
| **`Enter`** | Any Screen | Advance / Submit / Post score |
| **`Escape`** | Any Screen | Back / Cancel round / Discard score |
| **`L`** | Home, Results | Leaderboard |
| **`S`** | Home Screen | Settings / Phone QR |
| **`W`** | Home Screen | Spawn secondary Crowd display window |
| **`Alt+N`**, **`Alt+T`** | Players | Add a Versus player, toggle team run |
| **`R`** | Voided round / Versus standings | Restart the run / Rematch |
| **`1`–`3`, `←→`, `↑↓`, `Del` ×2, `B`, `T`** | Leaderboard | Board, select row, delete run, backup file, show team runs |
| **`1`–`3`, `R`, `A`** | Crowd Window | Pin Sprint, Minute, Max, Recent, or Auto carousel |
