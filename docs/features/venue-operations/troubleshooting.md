# Tournament Troubleshooting & Incident Response Matrix

> **Target Audience**: Match Operators, AV Techs & Developers  
> **Related Documents**: [Operator Runbook](operator-runbook.md), [Phone Camera](../phone-camera/README.md)  
> **Maintenance Status**: Active / Operational Diagnostic Guide  

---

## 1. Quick Diagnostic Decision Tree

| Symptom | Probable Cause | Immediate Remediation |
| :--- | :--- | :--- |
| **"No local network found" in Settings** | Laptop Wi-Fi is disabled or not connected to any network. | Enable phone's Personal Hotspot and join it from the laptop, or connect laptop to venue router. |
| **Phone page loads forever after scanning the QR code** (browser prototype) | Venue/school Wi-Fi blocks devices from reaching each other. | In **+ Add camera** use the **Any network** tab (internet link, works on any network), or join the laptop to the phone's hotspot. See [Browser Prototype Pairing](../phone-camera/browser-prototype-pairing.md). |
| **Phone shows "Connection Not Private"** | Expected behavior for self-signed local TLS certificates. | Tap **Advanced ➔ Proceed to site (unsafe)** on the phone browser. |
| **Phone connects, but video is black or won't start** | Camera permissions blocked in mobile browser. | Tap URL lock icon in phone browser ➔ Permissions ➔ Camera ➔ Allow, then reload page. |
| **Ready check fails: "Hold top plank" never ticks** | Athlete's arms not fully extended or hips sagging. | Instruct athlete to push floor away and lock hips straight; check that camera is side-on. |
| **Ready check fails: "Frame rate too low (< 24 FPS)"** | Wi-Fi congestion or phone battery-saver mode. | On phone web page, switch resolution to **640 px**; plug phone into charger; move closer to router. |
| **Round was unexpectedly voided mid-match** | Athlete moved out of frame for > 500ms (`tracking_loss_ms`). | Ensure camera frame includes head-to-toe buffer; reposition mat 20cm back if athlete creeps forward. |
| **Reps not counting: Red Depth Light on deep reps** | Camera is elevated too high looking downward, distorting elbow angle. | Lower phone camera tripod to 0.2m–0.3m off ground, parallel with the athlete's chest level. |
| **Crowd screen is black or out of sync** | Window lost focus or route unmounted. | Press **Esc** on operator screen, re-press **W** to spawn fresh crowd window. |
| **Accidental or corrupted score submitted** | Operator error or athlete foul. | On the Results screen press **Esc** (discard). Later: press **L**, select the row with **↑↓**, press **Delete** twice. |
| **Build fails: `Rollup failed to resolve import "@fontsource/patrick-hand"`** (or any other package) | A pull or patch added a package that isn't installed yet. | Run `npm install` in `frontend/`. The launch scripts now do this automatically when `package-lock.json` changes. |
| **`./scripts/launch.sh: Permission denied`** (macOS/Linux) | The file lost its executable bit (committed from Windows). | `chmod +x scripts/launch.sh`; commit with `git update-index --chmod=+x scripts/launch.sh`. |

---

## 2. Emergency Fallback Procedure: Switching to Webcam

If the venue Wi-Fi collapses entirely during an event:
1. Press **S** (Settings).
2. Under **Camera Source**, switch from *Phone Camera* to **Laptop Webcam** or a plugged-in USB webcam.
3. Place the laptop directly on a chair beside the mat.
4. Competitive judging resumes immediately without network dependencies.
