# Feature 07: Tournament Venue Operations & Physical Setup

> **Target Audience**: Tournament Directors, Match Referees, AV Techs, and System Operators  
> **Related Documents**: [Operator Runbook](operator-runbook.md), [Troubleshooting Matrix](troubleshooting.md), [Phone Camera](../phone-camera/README.md)  
> **Maintenance Status**: Active / Field Manual  

---

## 1. Executive Summary

Pump Court is built for push-up contests at events, in gyms and at school fairs. Good judging needs a camera placed side-on at about knee height, the whole body in view, even light, and (for a phone camera) internet for the default **Phone · any network** link, or a network the phone and laptop share (**Phone · same Wi-Fi**).

---

## 2. Stage & Physical Layout Specifications

```text
                  [ External Crowd Screen / Projector ]
                                    ▲
                                    │ (HDMI)
                        [ Operator / Judge Desk ]
                         (Laptop running Pump Court)
                                    ▲
                                    │ (any network, or same Wi-Fi / hotspot; or a USB webcam)
                                    ▼
       1.5m - 2.0m        [ Phone or webcam on a stand ]
 ◄──────────────────────► (Floor level, landscape)
┌────────────────────────────────────────────────────────┐
│                                                        │
│                    EXERCISE MAT                        │
│             [ Player side-on to the camera ]             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Critical Physical Parameters:
1. **Camera Angle**: **Side-on** to the player. The tracker follows the side nearer the camera. Head, hands and feet must stay in the picture for the whole round.
2. **Camera Distance**: About **1.5 to 2.0 meters** from the edge of the mat.
3. **Camera Height**: **About knee height** (0.2 to 0.5 m off the floor). From higher up, looking down, the angles and the floor line come out wrong.
4. **Hands visible**: the near hand must be in view. The ready check plants a floor line at the wrists; without it, Depth falls back to the elbow angle.
5. **Lighting**: Even light. Avoid a bright window behind the player; it turns them into a silhouette.
6. **Background Contrast**: Clothing that stands out from the floor and the wall helps the pose model.
7. **One person in view**: the model tracks one person (`numPoses: 1`). Keep the queue out of the picture.
8. **Phone on its side**: landscape fits a player best. Rotation lock can stay on: the app turns the picture upright using the phone's tilt. If it gets it wrong, press **⟳ Rotate** on the camera picture.
9. **Legs in view**: the ready check needs straight legs (knee at least 150°), so knees and feet must be visible.
