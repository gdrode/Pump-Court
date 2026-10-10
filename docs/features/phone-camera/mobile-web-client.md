# Mobile Web Camera Client Architecture

> **Module**: `backend/src/phone/page.html` and `pumpCourt/phone.html`  
> **Key APIs**: `getUserMedia`, `HTMLCanvasElement.toBlob`, `Screen Wake Lock API`  
> **Related Documents**: [Phone Camera Overview](README.md), [Pairing & Protocol](pairing-and-websocket.md)  
> **Maintenance Status**: Active / Client Specification  

---

## 1. Overview & Constraints

`page.html` is an inlined, dependency-free HTML5/CSS/JavaScript single-file application compiled directly into the Rust backend binary via `include_str!("page.html")`. 

When the mobile browser opens the URL, this application:
1. Prompts for camera permissions using `facingMode: "environment"` (rear camera).
2. Requests the **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) to prevent the phone from sleeping during matches.
3. Captures frames onto an offscreen canvas and encodes them to JPEG at ~30 FPS.
4. Transmits binary blobs over the WebSocket.

---

## 2. Capture & Compression Loop

To maximize frame rate over local Wi-Fi while minimizing mobile thermal throttling and battery consumption:

```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

function sendFrame() {
  if (!streaming || ws.readyState !== WebSocket.OPEN) return;
  
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  
  canvas.toBlob((blob) => {
    if (blob && ws.bufferedAmount === 0) { // Backpressure guard!
      ws.send(blob);
    }
    requestAnimationFrame(sendFrame);
  }, 'image/jpeg', 0.7); // 70% quality JPEG balance
}
```

### Backpressure Protection
Notice `ws.bufferedAmount === 0`: If the Wi-Fi network experiences transient congestion, frames are dropped on the phone rather than queuing up in socket buffers. This guarantees that latency never exceeds 1 frame (~33ms).

---

## 3. Resolution Selector

The phone web interface includes a resolution toggle:
- **`640 px`**: Ultra-low latency, ideal for congested 2.4 GHz venue Wi-Fi networks.
- **`960 px` (Default)**: Optimal balance of tracking precision and bandwidth (~80 KB per frame).
- **`1280 px`**: Maximum fidelity for high-end smartphones on dedicated 5 GHz networks.
