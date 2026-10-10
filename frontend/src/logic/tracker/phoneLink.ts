// Laptop side of a phone camera, ported from pumpCourt/src/phoneLink.ts and
// relayLink.ts. The pairing room lives in the Rust app (backend/src/phone), so
// messages come over Tauri IPC instead of the Vite dev server's WebSocket.
//
//   Wi-Fi:       phone ──WebRTC video──▶ here     (offer/answer/ICE via the room)
//   Any network: phone ──JPEG frames──▶ Rust relay ──IPC──▶ here (drawn to a canvas stream)
import { RTC_CONFIG } from "@tracker/phone/protocol";
import { backend } from "../../api/backend";
import type { PhoneNote, PhoneRoomMessage, SignalData } from "../../api/types";

export type PhoneStatus = "waiting" | "connecting" | "connected" | "disconnected" | "failed";

export interface PhoneLinkHandlers {
  onStatus(status: PhoneStatus, detail?: string): void;
  onStream(stream: MediaStream): void;
  /** A phone loaded the pairing page, so it can reach this laptop. */
  onVisit?(from: string): void;
  /** The phone says how to turn its picture upright (clockwise degrees: 0, 90, 180, 270). */
  onOrientation?(rotation: number): void;
  /** After a round: the player tapped "Post my score" (true) or "Don't post" (false). */
  onPost?(post: boolean): void;
}

export interface PhoneLink {
  /** The 8-letter pairing code. */
  room: string;
  /** Point status updates somewhere else, e.g. from the pairing dialog to the camera list. */
  setHandlers(h: PhoneLinkHandlers): void;
  /** Shows the player something on the phone (their round's stats). */
  notify(note: PhoneNote): void;
  close(): void;
}

/** Opens a pairing room. The same room takes a Wi-Fi (WebRTC) or an "Any network" (relay) phone. */
export async function openPhoneLink(handlers: PhoneLinkHandlers): Promise<PhoneLink> {
  let h = handlers;
  let closed = false;
  let room = "";
  let pc: RTCPeerConnection | null = null;
  let chain = Promise.resolve();
  // ICE candidates that arrive before the offer has been applied.
  let pending: RTCIceCandidateInit[] = [];
  // Replayed to whoever takes over the link (the pairing dialog hands it to the camera list).
  let lastOrientation: number | null = null;
  const orientation = (rotation: unknown) => {
    if (typeof rotation !== "number" || ![0, 90, 180, 270].includes(rotation)) return;
    lastOrientation = rotation;
    h.onOrientation?.(rotation);
  };
  const relay = relayCanvas((s) => h.onStream(s), () => h.onStatus("connected"));

  const send = (data: SignalData) => {
    if (room && !closed) void backend.phoneSignal(room, data);
  };

  const newPeer = () => {
    pc?.close();
    const peer = new RTCPeerConnection(RTC_CONFIG);
    pc = peer;
    peer.onicecandidate = (e) => {
      if (e.candidate) send({ candidate: e.candidate.toJSON() });
    };
    peer.ontrack = (e) => h.onStream(e.streams[0] ?? new MediaStream([e.track]));
    peer.onconnectionstatechange = () => {
      if (peer !== pc || closed) return;
      const s = peer.connectionState;
      if (s === "connected") h.onStatus("connected");
      else if (s === "failed") h.onStatus("failed", "Could not reach the phone. Put both on the same Wi-Fi or hotspot.");
      else if (s === "disconnected") h.onStatus("disconnected");
    };
    return peer;
  };

  const onSignal = async (data: SignalData) => {
    if ("sdp" in data) {
      if (data.sdp.type !== "offer") return;
      const peer = newPeer();
      await peer.setRemoteDescription(data.sdp);
      await peer.setLocalDescription(await peer.createAnswer());
      send({ sdp: peer.localDescription!.toJSON() });
      for (const c of pending) await peer.addIceCandidate(c).catch(() => {});
      pending = [];
    } else if ("orientation" in data) {
      orientation(data.orientation);
    } else if ("post" in data) {
      if (typeof data.post === "boolean") h.onPost?.(data.post);
    } else if ("candidate" in data) {
      if (!pc?.remoteDescription) pending.push(data.candidate);
      else await pc.addIceCandidate(data.candidate).catch(() => {});
    }
  };

  const onMessage = (msg: PhoneRoomMessage) => {
    if (closed) return;
    if (msg.type === "joined") h.onStatus("waiting");
    else if (msg.type === "phone-visit") h.onVisit?.(msg.from);
    else if (msg.type === "orientation") orientation(msg.rotation);
    else if (msg.type === "post") h.onPost?.(msg.post);
    else if (msg.type === "peer-joined") {
      relay.reset();
      h.onStatus("connecting");
    } else if (msg.type === "peer-left") {
      pc?.close();
      pc = null;
      relay.reset();
      h.onStatus("disconnected", "The phone page was closed or lost its connection.");
    } else if (msg.type === "signal") {
      chain = chain.then(() => onSignal(msg.data)).catch((err) => h.onStatus("failed", String(err)));
    } else if (msg.type === "error") h.onStatus("failed", msg.message);
  };

  const link: PhoneLink = {
    get room() {
      return room;
    },
    setHandlers(next) {
      h = next;
      if (lastOrientation != null) h.onOrientation?.(lastOrientation);
    },
    notify(note) {
      if (room && !closed) void backend.phoneNotify(room, note).catch(() => {});
    },
    close() {
      if (closed) return;
      closed = true;
      pc?.close();
      relay.stop();
      if (room) void backend.phoneClose(room);
    },
  };

  try {
    room = await backend.phoneOpen(onMessage, (jpeg) => relay.frame(jpeg));
  } catch (err) {
    h.onStatus("failed", String(err));
    throw err;
  }
  if (closed) void backend.phoneClose(room); // closed while opening
  return link;
}

/**
 * Turns relayed JPEG frames into a MediaStream, so a phone on the internet
 * link is used like any other camera. Only the newest frame waits: if
 * decoding falls behind, older frames are skipped.
 */
function relayCanvas(onStream: (s: MediaStream) => void, onLive: () => void) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  let stream: MediaStream | null = null;
  let track: (MediaStreamTrack & { requestFrame?: () => void }) | null = null;
  let pending: Blob | null = null;
  let decoding = false;
  let live = false;
  let stopped = false;

  const draw = async () => {
    if (decoding || !pending || stopped) return;
    decoding = true;
    const blob = pending;
    pending = null;
    try {
      const img = await createImageBitmap(blob);
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
      img.close();
      if (!stream) {
        // captureStream(0): a new video frame only when requestFrame() is called, one per phone frame.
        stream = canvas.captureStream(0);
        track = stream.getVideoTracks()[0];
        onStream(stream);
      }
      if (!live) {
        live = true;
        onLive();
      }
      track?.requestFrame?.();
    } catch {
      // A damaged frame: skip it.
    }
    decoding = false;
    if (pending) void draw();
  };

  return {
    frame(data: ArrayBuffer | Uint8Array | number[]) {
      const bytes = Array.isArray(data) ? new Uint8Array(data) : data;
      pending = new Blob([bytes], { type: "image/jpeg" });
      void draw();
    },
    /** The phone dropped or reconnected: the next frame says "connected" again. */
    reset() {
      live = false;
    },
    stop() {
      stopped = true;
      track?.stop();
    },
  };
}
