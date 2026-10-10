# Tournament Troubleshooting & Incident Response Matrix

> **Target Audience**: Match Operators, AV Techs & Developers  
> **Related Documents**: [Operator Runbook](operator-runbook.md), [Phone Camera](../phone-camera/README.md)  
> **Maintenance Status**: Active / Operational Diagnostic Guide  

---

## 1. Quick Diagnostic Decision Tree

| Symptom | Probable Cause | Immediate Remediation |
| :--- | :--- | :--- |
| **"No local network found" in Settings** | Laptop Wi-Fi is disabled or not connected to any network. | Enable phone's Personal Hotspot and join it from the laptop, or connect laptop to venue router. |
| **Phone shows "Connection Not Private"** | Expected behavior for self-signed local TLS certificates. | Tap **Advanced ➔ Proceed to site (unsafe)** on the phone browser. |
| **Phone connects, but video is black or won't start** | Camera permissions blocked in mobile browser. | Tap URL lock icon in phone browser ➔ Permissions ➔ Camera ➔ Allow, then reload page. |
| **Ready check fails: "Hold top plank" never ticks** | Athlete's arms not fully extended or hips sagging. | Instruct athlete to push floor away and lock hips straight; check that camera is side-on. |
| **Ready check fails: "Frame rate too low (< 24 FPS)"** | Wi-Fi congestion or phone battery-saver mode. | On phone web page, switch resolution to **640 px**; plug phone into charger; move closer to router. |
| **Round was unexpectedly voided mid-match** | Athlete moved out of frame for > 500ms (`tracking_loss_ms`). | Ensure camera frame includes head-to-toe buffer; reposition mat 20cm back if athlete creeps forward. |
| **Reps not counting: Red Depth Light on deep reps** | Camera is elevated too high looking downward, distorting elbow angle. | Lower phone camera tripod to 0.2m–0.3m off ground, parallel with the athlete's chest level. |
| **Crowd screen is black or out of sync** | Window lost focus or route unmounted. | Press **Esc** on operator screen, re-press **C** to spawn fresh crowd window. |
| **Accidental or corrupted score submitted** | Operator error or athlete foul. | Press **L** (Leaderboard), locate row, and click **Delete** (trash icon). |

---

## 2. Emergency Fallback Procedure: Switching to Webcam

If the venue Wi-Fi collapses entirely during an event:
1. Press **S** (Settings).
2. Under **Camera Source**, switch from *Phone Camera* to **Laptop Webcam** or a plugged-in USB webcam.
3. Place the laptop directly on a chair beside the mat.
4. Competitive judging resumes immediately without network dependencies.

---

## 3. Browser app (`pumpCourt/`): phone QR code opens nothing

1. Phone and laptop on the **same** network (hotspot is most reliable). Guest Wi-Fi often blocks device-to-device traffic.
2. In **+ Add camera → Phone over Wi-Fi**, watch the dialog: if it never says a phone visited, the phone can't reach the laptop.
3. Pick another address in the list, or the **by name** (`.local`) one, and rescan.
4. Accept the "connection not private" warning once on the phone.
5. Sitting/standing counts no reps by design: the player must get into a flat plank with hands on the floor and hold still ~0.5 s.
