// Every call into the Rust backend goes through this file.
// `invoke` calls a #[tauri::command]; `listen` subscribes to an emitted event.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Category,
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
};

/** Error text from a rejected invoke (Rust `Err(String)`). */
export function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}
