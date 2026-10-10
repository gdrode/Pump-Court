# Feature 07: Tournament Venue Operations & Physical Setup

> **Target Audience**: Tournament Directors, Match Referees, AV Techs, and System Operators  
> **Related Documents**: [Operator Runbook](operator-runbook.md), [Troubleshooting Matrix](troubleshooting.md), [Phone Camera](../phone-camera/README.md)  
> **Maintenance Status**: Active / Field Manual  

---

## 1. Executive Summary

Pump-Court is engineered for real-world competitive fitness tournaments, gym throwdowns, and esports-style stage events. Achieving high-accuracy optical judging requires proper physical staging, correct camera geometry, solid lighting, and reliable local network configuration.

---

## 2. Stage & Physical Layout Specifications

```text
                  [ External Crowd Screen / Projector ]
                                    ▲
                                    │ (HDMI)
                        [ Operator / Judge Desk ]
                         (Laptop running Tauri)
                                    ▲
                                    │ (Local Wi-Fi / Hotspot)
                                    ▼
       1.5m - 2.0m        [ Smartphone on Tripod ]
 ◄──────────────────────► (Floor level, landscape)
┌────────────────────────────────────────────────────────┐
│                                                        │
│                    EXERCISE MAT                        │
│             [ Athlete in Side-On Profile ]             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Critical Physical Parameters:
1. **Camera Angle**: Strictly **perpendicular side-on** to the athlete. The athlete's head and feet must remain inside the camera frame throughout the entire movement.
2. **Camera Distance**: Between **1.5 and 2.0 meters** from the edge of the mat.
3. **Camera Elevation**: **0.2 to 0.4 meters** off the floor (a standard mini-tripod or phone stand). Placing the camera too high (e.g. eye level looking down) distorts elbow flexion angles.
4. **Lighting**: Ensure even, diffuse lighting. Avoid strong backlight (e.g. bright windows directly behind the athlete) which turns the athlete into a silhouette and impairs landmark visibility.
5. **Background Contrast**: High contrast between the athlete's clothing and the gym floor/background maximizes landmark detection confidence.
