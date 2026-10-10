// Every call into the Rust backend goes through this file.
// `invoke` calls a #[tauri::command]; `listen` subscribes to an emitted event.

import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Category,
  CrowdView,
  PhoneLink,
  PhoneStatus,
  PushedPoseFrame,
  RecentRun,
  JudgeConfig,
  LeaderboardRow,
  RepVerdict,
  RoundMode,
  RoundResult,
  SourceInfo,
  SourceSpec,
  SourceStatus,
  Tick,
} from "./types";

export const backend = {
  listSources: () => invoke<SourceInfo[]>("list_sources"),
  startSource: (spec: SourceSpec) => invoke<void>("start_source", { spec }),
  stopSource: () => invoke<void>("stop_source"),
  checkName: (name: string) => invoke<string>("check_name", { name }),
  startRound: (mode: RoundMode, player: string, isTeam: boolean) =>
    invoke<void>("start_round", { mode, player, isTeam }),
  cancelRound: () => invoke<void>("cancel_round"),
  getJudgeConfig: () => invoke<JudgeConfig>("get_judge_config"),
  setJudgeConfig: (config: JudgeConfig) => invoke<void>("set_judge_config", { config }),
  getLeaderboard: (category: Category, includeTeam = false, limit = 20) =>
    invoke<LeaderboardRow[]>("get_leaderboard", { category, includeTeam, limit }),
  getPlayerCount: () => invoke<number>("get_player_count"),
  getRecentRuns: (includeTeam = false, limit = 10) => invoke<RecentRun[]>("get_recent_runs", { includeTeam, limit }),
  getCrowdView: () => invoke<CrowdView>("get_crowd_view"),
  setCrowdView: (view: CrowdView) => invoke<void>("set_crowd_view", { view }),
  getPhoneLink: () => invoke<PhoneLink>("get_phone_link"),
  newPairingCode: () => invoke<PhoneLink>("new_pairing_code"),
  /** Every phone camera frame as JPEG bytes, for a tracker in the frontend. */
  subscribePhoneFrames: (onFrame: (jpeg: ArrayBuffer) => void) => {
    const channel = new Channel<ArrayBuffer>();
    channel.onmessage = onFrame;
    return invoke<void>("subscribe_phone_frames", { onFrame: channel });
  },
  /** A frontend tracker hands over one frame of landmarks (use the "pushed" source). */
  pushPoseFrame: (frame: PushedPoseFrame) => invoke<void>("push_pose_frame", { frame }),
  deleteRun: (runId: number) => invoke<void>("delete_run", { runId }),
  exportBackup: () => invoke<string>("export_backup"),
  openCrowdWindow: () => invoke<void>("open_crowd_window"),
};

export const events = {
  onTick: (cb: (t: Tick) => void): Promise<UnlistenFn> => listen<Tick>("tick", (e) => cb(e.payload)),
  onRep: (cb: (v: RepVerdict) => void) => listen<RepVerdict>("rep", (e) => cb(e.payload)),
  onRoundFinished: (cb: (r: RoundResult) => void) =>
    listen<RoundResult>("round-finished", (e) => cb(e.payload)),
  onSourceStatus: (cb: (s: SourceStatus) => void) =>
    listen<SourceStatus>("source-status", (e) => cb(e.payload)),
  onPhoneStatus: (cb: (s: PhoneStatus) => void) => listen<PhoneStatus>("phone-status", (e) => cb(e.payload)),
  onCrowdView: (cb: (v: CrowdView) => void) => listen<CrowdView>("crowd-view", (e) => cb(e.payload)),
};

/** Error text from a rejected invoke (Rust `Err(String)`). */
export function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}
