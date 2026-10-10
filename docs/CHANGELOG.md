# Changelog

Short, plain-words log of each work session. Newest first.

## 2026-10-10 — Phone pairing fix, posture gate, abdominal torso point

**Asked for:**
1. QR code led to nothing on phones (same hotspot / Wi-Fi).
2. Judge: aim above the trunk, add a mid-back / abdominal point for hip flexion and crunching.
3. Sitting still counted several push-ups. Use hand position as the floor to measure up/down.

**Done (in `pumpCourt/`):**
- Phone signaling over plain HTTPS (`/signal-http/*`), Bonjour `.local` address, "phone visited" diagnostics, leave-on-close. → [Pairing](features/phone-camera/pairing-and-websocket.md)
- Abdominal point at 60 % shoulder → hip; Torso light now uses it; sag / pike fault wording; knee check. → [Angles](features/referee-engine/angles-and-biomechanics.md)
- Posture gate: no reps unless flat plank, hands on floor, held still. Floor line from planted hands. Shoulders must really drop. → [Ready check](features/referee-engine/ready-check-calibration.md)
- Troubleshooting steps for the QR problem. → [Troubleshooting](features/venue-operations/troubleshooting.md)

- Fix: a phone replaced by a second phone now learns why (it used to just get "gone"). Tested end to end in a real browser: QR → phone page → live video → close tab = laptop sees "disconnected".

**Checks:** `npm test` in `pumpCourt/` → 213 / 213 pass, `tsc -b` clean.
