# Stage Operator Tournament Playbook

> **Role**: Tournament Operator & Lead Referee  
> **Key Shortcuts**: `1`–`4` (Modes), `Enter` (Advance), `Esc` (Back/Cancel), `L` (Board), `S` (Settings), `C` (Crowd)  
> **Related Documents**: [Venue Operations Overview](README.md), [Troubleshooting Matrix](troubleshooting.md)  
> **Maintenance Status**: Active / Match Day Runbook  

---

## 1. Pre-Event System Checklist (15 Minutes Before Event)

1. **Power & Displays**:
   - Plug tournament laptop into AC power (disable OS sleep / screen savers).
   - Connect HDMI cable to crowd display / projector.
   - Boot desktop app: `cargo tauri dev` or launch installed binary.
   - Press **C** on Home screen to spawn the Crowd window. Drag it onto the external projector and press Fullscreen (F11 / Cmd+Ctrl+F).
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
  │ Operator presses 1 (Sprint), 2 (Minute), 3 (Max), or 4 (Duel)
  ▼
[ NAME ENTRY ]
  │ Operator types athlete's name (max 12 chars). Toggle 'Team' if applicable.
  │ Operator presses Enter.
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
  │ Three referee lights fire on every rep (Ding for 2-3 white, Buzzer for no-rep).
  │ Clock runs down to zero (or 5s idle in Max mode).
  ▼
[ RESULTS SCREEN ]
  │ Final score, accuracy, and fault breakdown displayed on both screens.
  │ Score saved automatically to SQLite leaderboard.
  │ Operator presses Enter to return to Home, or L to view updated leaderboard.
```

---

## 3. Quick Reference Keyboard Hotkeys

| Key | Context | Action |
| :--- | :--- | :--- |
| **`1`** | Home Screen | Select Sprint Mode (30s) |
| **`2`** | Home Screen | Select Minute Mode (60s) |
| **`3`** | Home Screen | Select Max Reps Mode (Sudden Death) |
| **`4`** | Home Screen | Select Duel Mode (1v1 Head-to-Head) |
| **`Enter`** | Any Screen | Advance / Submit / Start next stage |
| **`Escape`** | Any Screen | Cancel active round / Back to Home |
| **`L`** | Any Screen | Toggle Leaderboard view |
| **`S`** | Any Screen | Toggle Settings / Phone QR view |
| **`C`** | Home Screen | Spawn secondary Crowd display window |
| **`1`–`3`, `R`, `A`** | Crowd Window | Pin Sprint, Minute, Max, Recent, or Auto carousel |
