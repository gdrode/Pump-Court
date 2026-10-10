# Tournament Troubleshooting & Incident Response Matrix

> **Target Audience**: Match Operators, AV Techs & Developers  
> **Related Documents**: [Operator Runbook](operator-runbook.md), [Phone Cameras](../phone-camera/README.md), [Internet Link](../phone-camera/internet-link.md)  
> **Maintenance Status**: Active / Operational Diagnostic Guide  

---

## 1. Quick Diagnostic Table

| Symptom | Probable Cause | What to do |
| :--- | :--- | :--- |
| **"This laptop isn't on a network"** in Add camera | Laptop Wi-Fi is off or not connected. | Join the venue Wi-Fi or the phone's hotspot. The list refreshes by itself every 5 s. |
| **Phone page never loads after scanning** | Venue/school Wi-Fi stops devices reaching each other, a VPN, or the phone is on a different network. | Follow the hints shown after 12 s (compare address prefixes, iPhone hotspot *Maximize Compatibility*, turn off VPNs), or use the **Phone · any network** tab (the default). |
| **Phone · any network: "cloudflared is not installed"** | The tunnel program is missing. | macOS `brew install cloudflared`; Windows `winget install --id Cloudflare.cloudflared`, then restart Pump Court. See [Internet Link](../phone-camera/internet-link.md). |
| **Phone · any network: "The internet link … never became reachable" / "stopped"** | No internet, or a firewall blocks cloudflared. | Check the laptop's internet; try again, or use the **Phone · same Wi-Fi (offline)** tab or a USB webcam. |
| **Phone shows Cloudflare's "Tunnel error" page** (Phone · any network) | cloudflared couldn't reach the app (older builds pointed it at `localhost`, which can mean IPv6 on Windows), or the link was stopped/restarted and the QR is stale. | Update, close and reopen **Add camera** to get a fresh QR. Still failing: use **Phone · same Wi-Fi**. |
| **"The camera is busy"** / `NotReadableError` (Windows) | Another app or browser tab holds the webcam: Chrome tab with the prototype, Teams, Zoom, Camera app, or the other player's slot on the same webcam. | Close the other app or tab, then pick the camera again. |
| **Phone shows "Connection not private"** | Expected: the laptop uses a self-signed certificate. | Safari: *Show Details → visit this website*. Chrome: *Advanced → Proceed*. |
| **Phone: "This pairing code has expired"** | The dialog was closed, or the phone was removed. | Open **Add camera** again and scan the new code. |
| **Phone: "Another phone took over this code"** | A second phone scanned the same code. | Use one phone per code; press **A** again for another phone. |
| **Phone connects, but no video / camera refused** | Camera permission blocked in the phone browser. | Allow the camera in the browser's site settings, then reload the page. |
| **Camera view says "Loading tracking…" for long** | The pose model is still loading (first run, slow GPU). | Wait a few seconds. If an error shows instead, run `npm install` in `frontend/` (it copies the model into `public/models`) and rebuild. |
| **Red camera banner on other screens** | The camera was unplugged, refused, or the phone dropped. | Click the banner to open the Camera screen; pick another camera or add the phone again. |
| **Player appears lying sideways or upside down** in the camera picture | Phone on its side with rotation lock on, automatic rotation picked the wrong way, motion permission declined, or a USB camera mounted sideways. | Press **⟳ Rotate** on the picture (Camera screen, or get-ready screen before the clock runs) until the player is upright. **auto** goes back to the phone's value. Changing it resets the floor line. |
| **Get-ready checklist stuck on "Whole body in view, side-on"** | Camera too close or too high, or the player faces the camera. | Move the camera back, at knee height, side-on. |
| **Stuck on "Near hand in view" / "Hands on the floor"** | The near hand is out of the picture or the camera looks down. | Lower and move the camera so the hand nearer to it is visible on the floor. |
| **Stuck on "Knees off the floor, legs straight"** | The player is on their knees, or the legs are bent (knee angle under 150°), or the knee is hidden. | Full plank, legs straight. Keep the near leg in view. |
| **Stuck on "Hold still at the top, arms straight"** | Arms not locked or the player keeps moving. | Ask the player to hold the top position for half a second. |
| **Many red Depth lights on deep push-ups** | Camera too high, or the floor line planted wrongly. Depth needs the shoulders to drop 30% of the player's own straight-arm height. | Lower the camera to knee height; abort (**Esc**) and start again so the floor line is planted afresh. |
| **Small dips at the top get no lights at all** | Expected: a drop under 25% of the top height is not an attempt (quarter reps, adjustments). | Nothing to fix. |
| **Crowd window blank, or main window buttons stop working** (Windows) | Older builds created the crowd window from a synchronous command and deadlocked. | Update: `open_crowd_window` is async now. Restart the app. |
| **Linux: camera list empty or camera refused** | The webkit2gtk web view blocks the camera unless asked. | The app turns on media streams and WebRTC for the main window at start; update to a current build. |
| **Add camera: "The phone camera server could not use port 47800"** | Port 47800 is in use (another Pump Court or the prototype). | Close the other program and restart Pump Court. |
| **Phone shows "The phone page isn't built yet"** | The app was compiled before `frontend/dist/phone.html` existed. | Run `npm run build` in `frontend/`, then rebuild the app (the launch scripts do both). |
| **Accidental or bad score saved** | Operator error or a foul. | On Results press **Esc** (discard). Later: **L**, select the row with **↑↓**, press **Delete** twice. |
| **Build fails: `Rollup failed to resolve import "…"`** | A pull added a package that isn't installed yet. | Run `npm install` in `frontend/`. The launch scripts do this when `package-lock.json` changes. |
| **`./scripts/launch.sh: Permission denied`** (macOS/Linux) | The file lost its executable bit. | `chmod +x scripts/launch.sh`; commit with `git update-index --chmod=+x scripts/launch.sh`. |

---

## 2. Fallback: switch to a webcam

If the phone link fails during an event:
1. Press **S** (Camera screen).
2. Click the laptop's built-in camera or a plugged-in USB webcam in the camera list (or plug one in and use **Add camera → USB / system camera → Refresh camera list**).
3. Put the laptop or webcam beside the mat, side-on, about knee height.
4. Judging carries on with no network.
