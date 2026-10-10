// Every call into the Rust backend goes through this file.
// `invoke` calls a #[tauri::command]; `listen` subscribes to an emitted event.

import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  FinishedRound,
  LanInfo,
  LeaderboardRow,
  PhoneRoomMessage,
  RepReport,
  RepVerdict,
  RoundMode,
  RoundResult,
  SessionSnapshot,
  SignalData,
  TunnelStatus,
} from "./types";

export const backend = {
  checkName: (name: string) => invoke<string>("check_name", { name }),
  /** Starts a round. It waits in "get ready" until `setReady(true)`. */
  startRound: (mode: RoundMode, player: string) => invoke<void>("start_round", { mode, player }),
  cancelRound: () => invoke<void>("cancel_round"),
  /** The tracker's posture check: holding the top of a push-up (starts the countdown). */
  setReady: (ready: boolean) => invoke<void>("set_ready", { ready }),
  /** The tracker judged a rep. Counted only while the clock runs. */
  reportRep: (rep: RepReport) => invoke<void>("report_rep", { rep }),
  /**
   * Saves a round the frontend played itself (a side-by-side Duel) to the
   * leaderboard. Returns it with its database id and rank, and tells every
   * window ("round-finished"), like a backend round.
   */
  saveRound: (round: FinishedRound) => invoke<RoundResult>("save_round", { round }),

  /** Each player's best round. `mode: null` = all modes (the all-time board). */
  getLeaderboard: (mode: RoundMode | null, limit = 20) => invoke<LeaderboardRow[]>("get_leaderboard", { mode, limit }),
  getPlayerCount: () => invoke<number>("get_player_count"),
  deleteRun: (runId: number) => invoke<void>("delete_run", { runId }),
  exportBackup: () => invoke<string>("export_backup"),
  openCrowdWindow: () => invoke<void>("open_crowd_window"),

  /**
   * Opens a phone pairing room. Returns its 8-letter code. Room messages
   * arrive on `onMessage`; relayed JPEG frames ("Any network") on `onFrame`.
   */
  phoneOpen: (onMessage: (m: PhoneRoomMessage) => void, onFrame: (jpeg: ArrayBuffer) => void) => {
    const events = new Channel<PhoneRoomMessage>();
    events.onmessage = onMessage;
    const frames = new Channel<ArrayBuffer>();
    frames.onmessage = onFrame;
    return invoke<string>("phone_open", { events, frames });
  },
  /** The laptop's WebRTC answer or ICE candidate, for the phone. */
  phoneSignal: (room: string, data: SignalData) => invoke<void>("phone_signal", { room, data }),
  phoneClose: (room: string) => invoke<void>("phone_close", { room }),
  phoneLan: () => invoke<LanInfo>("phone_lan"),
  tunnelStatus: () => invoke<TunnelStatus>("tunnel_status"),
  tunnelStart: () => invoke<TunnelStatus>("tunnel_start"),
  tunnelStop: () => invoke<TunnelStatus>("tunnel_stop"),
};

export const events = {
  onTick: (cb: (s: SessionSnapshot) => void): Promise<UnlistenFn> => listen<SessionSnapshot>("tick", (e) => cb(e.payload)),
  onRep: (cb: (v: RepVerdict) => void) => listen<RepVerdict>("rep", (e) => cb(e.payload)),
  onRoundFinished: (cb: (r: RoundResult) => void) => listen<RoundResult>("round-finished", (e) => cb(e.payload)),
};

/** True in the second, crowd-facing window (opened by `openCrowdWindow`). */
export function isCrowdWindow(): boolean {
  try {
    if (getCurrentWindow().label === "crowd") return true;
  } catch {
    /* not inside Tauri (browser preview) */
  }
  return window.location.hash === "#/crowd";
}

/** Error text from a rejected invoke (Rust `Err(String)`). */
export function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}
