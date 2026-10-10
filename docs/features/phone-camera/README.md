# Feature 04: Phone Camera Zero-Install Wireless Video Bridge

> **Module**: `backend/src/phone/`  
> **Key Types**: `PhoneHub`, `PhoneLink`, `PhoneStatus`, `PhoneFrame`  
> **Related Documents**: [HTTPS & TLS](https-and-tls.md), [Pairing & WebSocket Protocol](pairing-and-websocket.md), [Mobile Web Client](mobile-web-client.md)  
> **Maintenance Status**: Active / Core Tournament Capability  

---

## 1. Executive Summary

In a competitive gym or tournament floor, positioning a laptop directly beside an athlete on the floor is hazardous and awkward. The **Phone Camera Bridge** allows an operator to place a smartphone on a mini-tripod beside the exercise mat while keeping the tournament laptop safely at the judge's table.

**Key Technical Achievements**:
- **Zero App Store Installs**: The athlete or judge scans a QR code; the smartphone opens its native web browser.
- **Zero Cloud / Internet Dependency**: All communication traverses the local Wi-Fi router or phone mobile hotspot directly between phone and laptop.
- **Embedded Axum Server**: The desktop app hosts its own HTTPS and WebSocket server on port `47800`.
- **High Throughput**: Streams compressed binary JPEG frames at ~30 FPS with sub-50ms latency.

```text
  ┌───────────────────────────────────────────────────────────────┐
  │                   LAPTOP (TOURNAMENT DESKTOP)                 │
  │                                                               │
  │   Settings (S) ──▶ Shows QR Code for:                         │
  │                    https://<laptop-ip>:47800/?code=654321     │
  │                                                               │
  │   Embedded Axum Daemon (:47800)                               │
  │     ├── GET /      ──▶ Serves page.html to mobile browser     │
  │     └── GET /ws    ──▶ Accepts WebSocket binary stream        │
  │              │                                                │
  │              ▼                                                │
  │          PhoneHub (Connection & frame routing)                │
  │         /        \                                            │
  │   PhoneSource    Frontend Preview & JS Trackers               │
  └───────▲───────────────────────────────────────────────────────┘
          │ (Local Network Wi-Fi / Hotspot)
          │
  ┌───────┴───────────────────────────────────────────────────────┐
  │                   SMARTPHONE (AT MAT LEVEL)                   │
  │                                                               │
  │   1. Native Camera App scans QR Code                          │
  │   2. Opens Safari / Chrome to https://<laptop-ip>:47800       │
  │   3. Taps "Start Camera"                                      │
  │   4. Streams 30 FPS binary JPEG frames over WebSocket         │
  └───────────────────────────────────────────────────────────────┘
```

---

## 2. Component Layout

```text
backend/src/phone/
├── mod.rs         # PhoneHub: state management, frame fan-out, pairing tokens
├── server.rs      # Axum HTTP/WSS routing, TLS termination, network interface discovery
└── page.html      # Self-contained, responsive mobile web app served to phones
```

---

## 3. The `PhoneHub` Central Dispatcher

`PhoneHub` is an `Arc`-managed thread-safe actor that:
- Holds the single active authorized pairing token.
- Maintains `PhoneStatus` (listening, connected, client device string, frame dimensions, measured FPS).
- Multiplexes incoming JPEG frames to native subscribers (`PhoneSource`) and UI subscribers.
- Enforces single-active-phone semantics: if a new phone connects with a valid token, the previous phone is sent `{"type":"replaced"}` and safely disconnected.
