// The motion tracker, running in the operator window. It wraps the teammate's
// plain-TypeScript modules in pumpCourt/src ("@tracker/…"):
//
//   camera / phone stream ─▶ <video> ─▶ MediaPipe pose (landmarker)
//     ─▶ side tracker (pose) ─▶ posture check ─▶ subscribers (the round's referee)
//
// One <video>, one rotated-picture <canvas> and one overlay <canvas> exist for
// the whole app. <CameraView> borrows them; detection runs only while at least
// one view is showing.
//
// Two trackers can run at once, one per camera: slot 0 (player 1, always on)
// and slot 1 (player 2 in a side-by-side Duel, on once a camera is picked).
// Components read the tracker of the slot they sit in (<TrackerSlot>), so the
// same camera view, Add camera dialog and pickers work for either player.
//
// Rotation (ported from pumpCourt/src/useLane.ts): a phone propped on its side
// with rotation lock on sends a sideways picture, and the pose tracker needs
// the player upright. The phone reports the turn it needs (`rotationHint`);
// the operator can override it per camera. The picture is turned onto the
// frame canvas, tracked there, and shown instead of the video.
import { listCameras, loadSavedCameraId, openCamera, saveCameraId, stopStream } from "@tracker/camera";
import { drawOverlay } from "@tracker/draw";
import { getLandmarker, MODEL, type LoadedLandmarker } from "@tracker/landmarker";
import { createSideTracker, type Landmark, type PoseAngles } from "@tracker/pose";
import { createPostureTracker, type Posture } from "@tracker/posture";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { backend } from "../../api/backend";
import type { PhoneLink, PhoneStatus } from "./phoneLink";

/** Clockwise turn applied to the camera picture before tracking and display. */
export type Rotation = 0 | 90 | 180 | 270;

/** What the tracker saw in one camera frame. */
export interface TrackerFrame {
  /** performance.now()-based time of the frame, ms. */
  t: number;
  /** Near-side angles, or null when nobody is tracked well enough. */
  angles: PoseAngles | null;
  /** Push-up position check (pumpCourt/src/posture.ts). */
  posture: Posture;
}

/** A paired phone camera. */
export interface PhoneCamera {
  id: string;
  label: string;
  stream: MediaStream | null;
  link: PhoneLink;
  status: PhoneStatus;
  detail: string;
  viaInternet: boolean;
  /** The phone's own idea of the turn its picture needs (from its tilt), if it said. */
  rotationHint: Rotation | null;
}

/** A camera the operator can pick: `device:<id>` or `phone:<id>`. */
export interface CameraChoice {
  key: string;
  label: string;
  /** Extra words for the list, e.g. "disconnected". */
  note?: string;
}

interface TrackerApi {
  cameras: CameraChoice[];
  /** Key of the camera in use. */
  current: string | null;
  choose(key: string): void;
  /** Re-reads the computer's camera list. */
  refreshDevices(): Promise<void>;
  /** A phone finished pairing in the Add camera dialog. */
  addPhone(p: { label: string; stream: MediaStream; link: PhoneLink; viaInternet: boolean }): void;
  removePhone(id: string): void;
  /** Closes the internet link if no paired phone uses it. */
  releaseTunnel(): void;
  /** Name for the next phone, e.g. "Phone 2". */
  nextPhoneLabel: string;
  cameraError: string | null;
  /** Player 2's tracker has a camera picked (always true for player 1). */
  hasCamera: boolean;
  /** "Loading tracking…" until the pose model is ready; an error if it failed. */
  modelStatus: { ready: boolean; error: string | null; delegate: string | null };
  /** Posture and pose rate, refreshed a few times a second (for display). */
  live: { posture: Posture | null; poseFps: number };
  /** Called with every tracked frame. Returns an unsubscribe function. */
  subscribe(cb: (f: TrackerFrame) => void): () => void;
  /** Forget the planted floor line, e.g. at the start of a round. */
  resetPosture(): void;
  /** Shows the camera inside `el`. Returns a function that takes it away again. */
  attach(el: HTMLElement): () => void;
  /** Turn applied to the current camera's picture. */
  rotation: Rotation;
  /** True when the rotation comes from the phone (or is the default), not the operator. */
  rotationAuto: boolean;
  /** Turns the current camera's picture 90° clockwise. */
  rotate(): void;
  /** Back to the phone's own rotation (0 for other cameras). */
  rotateAuto(): void;
}

/** One context per camera slot (player 1, player 2). */
const TRACKERS = [createContext<TrackerApi | null>(null), createContext<TrackerApi | null>(null)];
/** Which slot the components inside it use. Default: player 1. */
const SlotContext = createContext<0 | 1>(0);

/** Makes everything inside use player 2's (slot 1) or player 1's tracker. */
export function TrackerSlot({ slot, children }: { slot: 0 | 1; children: ReactNode }) {
  return <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>;
}

/** The tracker for this part of the screen (see TrackerSlot), or a given slot. */
export function useTracker(slot?: 0 | 1): TrackerApi {
  const here = useContext(SlotContext);
  const p1 = useContext(TRACKERS[0]);
  const p2 = useContext(TRACKERS[1]);
  const api = (slot ?? here) === 1 ? p2 : p1;
  if (!api) throw new Error("useTracker needs <TrackerProvider> for that slot");
  return api;
}

/** Calls `cb` with each tracked frame while the component is mounted. */
export function useTrackerFrames(cb: (f: TrackerFrame) => void, slot?: 0 | 1) {
  const { subscribe } = useTracker(slot);
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => subscribe((f) => latest.current(f)), [subscribe]);
}

/**
 * Paired phones on the internet link, across both slots, so the link only
 * closes when no player's phone uses it.
 */
const internetPhones = new Set<string>();

export function TrackerProvider({ children, slot = 0 }: { children: ReactNode; slot?: 0 | 1 }) {
  // The shared video and overlay. Created once, moved into whichever view shows them.
  const [video] = useState(() => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    return v;
  });
  const [canvas] = useState(() => document.createElement("canvas"));
  /** Shows the turned picture when rotation isn't 0 (the video is hidden then). */
  const [frame] = useState(() => {
    const c = document.createElement("canvas");
    c.className = "camera-view__frame";
    return c;
  });

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [phones, setPhones] = useState<PhoneCamera[]>([]);
  // Player 1 starts on the saved camera. Player 2 has none until one is picked.
  const [current, setCurrent] = useState<string | null>(() => {
    if (slot === 1) return null;
    const saved = loadSavedCameraId();
    return saved ? `device:${saved}` : null;
  });
  /** Player 2's tracker only runs once it has a camera. */
  const enabled = slot === 0 || current !== null;
  /** The device actually opened (the saved one may be gone, then any camera is used). */
  const [openedDevice, setOpenedDevice] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [model, setModel] = useState<LoadedLandmarker | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cpuOnly, setCpuOnly] = useState(false);
  const [attached, setAttached] = useState(0);
  const [live, setLive] = useState<TrackerApi["live"]>({ posture: null, poseFps: 0 });
  const subscribers = useRef(new Set<(f: TrackerFrame) => void>());
  const postureRef = useRef(createPostureTracker());
  const phoneCount = useRef(0);
  /** The operator's rotation per camera key; missing = automatic. */
  const [manualRotation, setManualRotation] = useState<Record<string, Rotation>>({});

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await listCameras());
    } catch (err) {
      setCameraError(String(err));
    }
  }, []);

  // The pose model: GPU first, CPU if the GPU can't run it.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setModelError(null);
    getLandmarker(MODEL, cpuOnly, slot).then(
      (m) => !cancelled && setModel(m),
      (err) => !cancelled && setModelError(`Pose tracking could not start: ${String(err)}`),
    );
    return () => {
      cancelled = true;
    };
  }, [cpuOnly, enabled, slot]);

  // Open the chosen camera. Phones already carry a live stream; devices are opened here.
  const phone = current?.startsWith("phone:") ? phones.find((p) => `phone:${p.id}` === current) : undefined;
  const phoneStream = phone?.stream ?? null;
  const currentKey = current?.startsWith("phone:") ? current : (openedDevice ?? current);
  const manual = currentKey ? manualRotation[currentKey] : undefined;
  const rotation: Rotation = manual ?? phone?.rotationHint ?? 0;
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  useEffect(() => {
    video.hidden = rotation !== 0;
    frame.hidden = rotation === 0;
  }, [rotation, video, frame]);
  useEffect(() => {
    let cancelled = false;
    let owned: MediaStream | null = null;
    setCameraError(null);
    setOpenedDevice(null);
    const show = (stream: MediaStream | null) => {
      video.srcObject = stream;
      if (stream) void video.play().catch(() => {});
    };
    if (current?.startsWith("phone:")) {
      show(phoneStream);
    } else if (!enabled) {
      show(null); // player 2 without a camera yet
    } else {
      const deviceId = current?.startsWith("device:") ? current.slice(7) : null;
      openCamera(deviceId)
        .catch((err) => (deviceId ? openCamera(null) : Promise.reject(err))) // saved camera unplugged: use any
        .then(async (stream) => {
          if (cancelled) return stopStream(stream);
          owned = stream;
          show(stream);
          const id = stream.getVideoTracks()[0]?.getSettings().deviceId;
          if (id) {
            if (slot === 0) saveCameraId(id);
            setOpenedDevice(`device:${id}`);
          }
          await refreshDevices(); // labels appear once the camera is allowed
        })
        .catch((err) => {
          if (cancelled) return;
          show(null);
          setCameraError(
            err?.name === "NotAllowedError"
              ? "Camera access was refused. Allow it for Pump Court in the system settings, then restart the app."
              : err?.name === "NotFoundError" || err?.name === "OverconstrainedError"
                ? "No camera found. Plug one in or add a phone camera."
                : err?.name === "NotReadableError"
                  ? "The camera is busy: another app or browser tab is using it (Chrome, Teams, Zoom, the Camera app, or the other player's slot). Close it, then pick the camera again."
                  : `Could not open the camera: ${String(err)}`,
          );
        });
    }
    return () => {
      cancelled = true;
      stopStream(owned);
    };
  }, [current, phoneStream, video, refreshDevices, enabled, slot]);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  // Count frames the camera actually delivered, so a frame is never judged twice.
  const presented = useRef(-1);
  useEffect(() => {
    if (!("requestVideoFrameCallback" in video)) return;
    let handle = 0;
    let alive = true;
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return;
      presented.current = meta.presentedFrames;
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => {
      alive = false;
      video.cancelVideoFrameCallback(handle);
    };
  }, [video]);

  // The detection loop: runs while the camera is on screen.
  useEffect(() => {
    if (!model || attached === 0) return;
    const ctx = canvas.getContext("2d")!;
    const sides = createSideTracker();
    let raf = 0;
    let lastPresented = -1;
    let lastVideoTime = -1;
    let lastTs = 0;
    let failures = 0;
    let lastFrameAt = performance.now();
    let cleared = false;
    let detections = 0;
    let since = performance.now();
    let lastUi = 0;

    const publish = (f: TrackerFrame) => {
      for (const cb of subscribers.current) cb(f);
      const now = performance.now();
      if (now - lastUi > 250) {
        lastUi = now;
        const poseFps = now - since >= 1000 ? (detections * 1000) / (now - since) : null;
        if (poseFps !== null) {
          detections = 0;
          since = now;
        }
        setLive((l) => ({ posture: f.posture, poseFps: poseFps ?? l.poseFps }));
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const isLive = !!track && track.readyState === "live" && !track.muted;
      const fresh = presented.current >= 0 ? presented.current !== lastPresented : video.currentTime !== lastVideoTime;
      if (video.readyState < 2 || !fresh || !isLive || !video.videoWidth) {
        // A stalled camera (e.g. a phone dropping out) must not leave a frozen skeleton or a "ready" behind.
        if (!cleared && performance.now() - lastFrameAt > 500) {
          cleared = true;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const t = performance.now();
          publish({ t, angles: null, posture: postureRef.current.update(t, null) });
        }
        return;
      }
      lastPresented = presented.current;
      lastVideoTime = video.currentTime;
      lastFrameAt = performance.now();
      cleared = false;
      // Turn the picture if needed: tracking runs on the upright picture.
      const rot = rotationRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const w = rot % 180 ? vh : vw;
      const h = rot % 180 ? vw : vh;
      let input: HTMLVideoElement | HTMLCanvasElement = video;
      if (rot) {
        if (frame.width !== w || frame.height !== h) {
          frame.width = w;
          frame.height = h;
        }
        const fctx = frame.getContext("2d")!;
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        if (rot === 90) {
          fctx.translate(w, 0);
          fctx.rotate(Math.PI / 2);
        } else if (rot === 180) {
          fctx.translate(w, h);
          fctx.rotate(Math.PI);
        } else {
          fctx.translate(0, h);
          fctx.rotate(-Math.PI / 2);
        }
        fctx.drawImage(video, 0, 0, vw, vh);
        input = frame;
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // detectForVideo needs strictly increasing timestamps.
      const t = Math.max(performance.now(), lastTs + 0.001);
      lastTs = t;
      let pose: Landmark[] | undefined;
      try {
        pose = model.landmarker.detectForVideo(input, t).landmarks[0];
      } catch (err) {
        if (++failures < 10) return;
        cancelAnimationFrame(raf);
        console.error("Pose detection keeps failing", err);
        if (model.delegate === "GPU") setCpuOnly(true);
        else setModelError(`Pose detection failed: ${(err as Error).message}`);
        return;
      }
      failures = 0;
      detections++;
      const angles = sides.update(pose, w / h);
      drawOverlay(ctx, pose, angles ? angles.side : null);
      publish({ t, angles, posture: postureRef.current.update(t, angles) });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    // A new rotation means a new picture geometry: start the side tracker fresh.
  }, [model, attached, video, canvas, frame, rotation]);

  // ...and forget the floor line, which was measured on the old picture.
  const firstRotation = useRef(true);
  useEffect(() => {
    if (firstRotation.current) {
      firstRotation.current = false;
      return;
    }
    postureRef.current.reset();
  }, [rotation]);

  const subscribe = useCallback((cb: (f: TrackerFrame) => void) => {
    subscribers.current.add(cb);
    return () => {
      subscribers.current.delete(cb);
    };
  }, []);

  const attach = useCallback(
    (el: HTMLElement) => {
      el.append(video, frame, canvas);
      // Moving a video element pauses it.
      void video.play().catch(() => {});
      setAttached((n) => n + 1);
      return () => {
        if (video.parentElement === el) el.removeChild(video);
        if (canvas.parentElement === el) el.removeChild(canvas);
        if (frame.parentElement === el) el.removeChild(frame);
        setAttached((n) => n - 1);
      };
    },
    [video, canvas, frame],
  );

  const addPhone = useCallback<TrackerApi["addPhone"]>(({ label, stream, link, viaInternet }) => {
    const id = link.room;
    const update = (patch: Partial<PhoneCamera>) => setPhones((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    link.setHandlers({
      onStatus: (status, detail) => update({ status, detail: detail ?? "" }),
      onStream: (s) => update({ stream: s }), // a reconnecting phone brings a new stream
      onOrientation: (r) => update({ rotationHint: r as Rotation }),
    });
    phoneCount.current += 1;
    if (viaInternet) internetPhones.add(id);
    setPhones((ps) => [...ps, { id, label, stream, link, status: "connected", detail: "", viaInternet, rotationHint: null }]);
    setCurrent(`phone:${id}`);
  }, []);

  const releaseTunnel = useCallback(() => {
    if (internetPhones.size === 0) void backend.tunnelStop().catch(() => {});
  }, []);

  const removePhone = useCallback(
    (id: string) => {
      setPhones((ps) => {
        ps.find((p) => p.id === id)?.link.close();
        return ps.filter((p) => p.id !== id);
      });
      setCurrent((c) => (c === `phone:${id}` ? null : c));
      if (internetPhones.delete(id)) releaseTunnel();
    },
    [releaseTunnel],
  );

  // Close every phone link when the app closes.
  const phonesRef = useRef(phones);
  phonesRef.current = phones;
  useEffect(() => () => phonesRef.current.forEach((p) => p.link.close()), []);

  const cameras: CameraChoice[] = useMemo(
    () => [
      ...devices.map((d, i) => ({ key: `device:${d.deviceId}`, label: d.label || `Camera ${i + 1}` })),
      ...phones.map((p) => ({
        key: `phone:${p.id}`,
        label: p.label,
        note: [p.viaInternet ? "any network" : "Wi-Fi", p.status !== "connected" ? p.status : ""].filter(Boolean).join(", "),
      })),
    ],
    [devices, phones],
  );

  const setManual = (r: Rotation | undefined) => {
    if (!currentKey) return;
    setManualRotation((m) => {
      const next = { ...m };
      if (r === undefined) delete next[currentKey];
      else next[currentKey] = r;
      return next;
    });
  };

  const api: TrackerApi = {
    cameras,
    current: currentKey,
    choose: setCurrent,
    refreshDevices,
    addPhone,
    removePhone,
    releaseTunnel,
    nextPhoneLabel: slot === 1 ? `P2 phone ${phoneCount.current + 1}` : `Phone ${phoneCount.current + 1}`,
    cameraError: cameraError ?? (phone && phone.status !== "connected" ? `${phone.label}: ${phone.status}. ${phone.detail}` : null),
    modelStatus: { ready: !!model && !modelError, error: modelError, delegate: model?.delegate ?? null },
    hasCamera: enabled,
    live,
    subscribe,
    resetPosture: useCallback(() => postureRef.current.reset(), []),
    attach,
    rotation,
    rotationAuto: manual === undefined,
    rotate: () => setManual(((rotation + 90) % 360) as Rotation),
    rotateAuto: () => setManual(undefined),
  };
  const Ctx = TRACKERS[slot];
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
