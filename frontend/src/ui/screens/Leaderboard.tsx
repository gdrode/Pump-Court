import { fmtPoints } from "@tracker/game";
import { useEffect, useState } from "react";
import { BOARDS, MODE_LABELS } from "../../config/modes";
import { eventTabs, sameTab, useEvents, type BoardRef } from "../../logic/useEvents";
import { useKeys } from "../../logic/useKeys";
import { useLeaderboard } from "../../logic/useLeaderboard";
import { DragonCameo } from "../components/DragonCameo";
import { KeyHints, type Hint } from "../components/KeyHints";
import { LeaderboardTable, TeamTable } from "../components/LeaderboardTable";

interface Props {
  /** Board to open on (default: the all-time board). */
  initial?: BoardRef;
  /** Name to mark, e.g. the player who just posted. */
  highlight?: string;
  onBack: () => void;
}

const GLOBAL_TABS: BoardRef[] = BOARDS.map((b) => ({ kind: "global", mode: b.mode }));

/**
 * Operator view: the global boards, or the active event's (E switches). An
 * event has one tab per mode (R picks everyone or one role) and one per team
 * leaderboard. Moderation (select + delete twice) and backup.
 */
export function Leaderboard({ initial, highlight, onBack }: Props) {
  const board = useLeaderboard(initial);
  const { list, active } = useEvents();
  const [sel, setSel] = useState<number | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  /** Reset the global boards: the first click asks, the second does it. */
  const [resetting, setResetting] = useState(false);
  const b = board.board;
  const event = b.kind === "global" ? null : (list.find((e) => e.id === b.eventId) ?? null);
  const tabs = event ? eventTabs(event) : GLOBAL_TABS;
  const tab = tabs.findIndex((t) => sameTab(t, b));
  const roles = b.kind === "event" && event ? event.roles : [];
  const teamBoard = b.kind === "team";
  const visible = Math.min(board.rows.length, 10);

  useEffect(() => {
    setSel(undefined);
    setConfirm(false);
    setResetting(false);
  }, [b]);
  const reset = async () => {
    if (!resetting) return setResetting(true);
    setResetting(false);
    await board.resetGlobal();
  };

  const pick = (i: number) => tabs[i] && board.setBoard(tabs[i]);
  const move = (d: number) => pick((Math.max(tab, 0) + d + tabs.length) % tabs.length);
  /** Global ↔ the active event. */
  const switchSource = () => {
    if (b.kind !== "global") return board.setBoard({ kind: "global", mode: b.mode });
    if (!active) return;
    const first = eventTabs(active);
    board.setBoard(first.find((t) => t.mode === b.mode) ?? first[0]);
  };
  const cycleRole = () => {
    if (b.kind !== "event" || !roles.length) return;
    const order = [null, ...roles];
    board.setBoard({ ...b, role: order[(order.indexOf(b.role) + 1) % order.length] });
  };

  const remove = async () => {
    const row = sel !== undefined ? board.rows[sel] : undefined;
    if (!row) return;
    if (!confirm) return setConfirm(true);
    await board.remove(row);
    setConfirm(false);
    setSel(undefined);
  };

  useKeys({
    ...Object.fromEntries(tabs.map((_, i) => [String(i + 1), () => pick(i)])),
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    ArrowUp: () => {
      if (teamBoard) return;
      setConfirm(false);
      setSel((s) => Math.max(0, (s ?? 1) - 1));
    },
    ArrowDown: () => {
      if (teamBoard) return;
      setConfirm(false);
      setSel((s) => Math.min(visible - 1, (s ?? -1) + 1));
    },
    Delete: () => void remove(),
    Backspace: () => void remove(), // Mac laptops have no forward-delete key
    e: switchSource,
    r: cycleRole,
    b: () => void board.exportBackup(),
    Escape: onBack,
    Enter: onBack,
  });

  const title = (t: BoardRef) =>
    t.kind === "global" ? (BOARDS.find((x) => x.mode === t.mode)?.title ?? "") : t.kind === "team" ? `Team · ${MODE_LABELS[t.mode]}` : MODE_LABELS[t.mode];

  const selected = sel !== undefined ? board.rows[sel] : undefined;
  const hints: Hint[] = [
    [`1–${tabs.length}`, "Board"],
    ...(active || event ? [["E", event ? "Global boards" : `${active?.name} boards`, switchSource] as Hint] : []),
    ...(roles.length ? [["R", "Role", cycleRole] as Hint] : []),
    ...(teamBoard ? [] : [["↑↓", "Select"] as Hint, ["Del", "Remove run", () => void remove()] as Hint]),
    ["B", "Backup file", () => void board.exportBackup()],
    ["Enter", "Menu", onBack],
  ];

  return (
    <div className="panel sketch leaderboard">
      <DragonCameo pose="sleep" place="board" />
      {(active || event) && (
        <div className="seg board-source" role="tablist" aria-label="Which boards">
          <button role="tab" aria-selected={!event} className={`seg__btn sketch ${!event ? "is-on" : ""}`} onClick={() => event && switchSource()}>
            Global
          </button>
          <button
            role="tab"
            aria-selected={!!event}
            className={`seg__btn sketch ${event ? "is-on" : ""}`}
            onClick={() => !event && switchSource()}
          >
            {(event ?? active)?.name}
          </button>
        </div>
      )}
      <div className="tabs" role="tablist">
        {tabs.map((t, i) => (
          <button key={title(t)} role="tab" aria-selected={i === tab} className={`sketch ${i === tab ? "is-on" : ""}`} onClick={() => pick(i)}>
            <kbd>{i + 1}</kbd> {title(t)}
          </button>
        ))}
      </div>
      {b.kind === "event" && roles.length > 0 && (
        <div className="chips" role="tablist" aria-label="Role">
          {[null, ...roles].map((r) => (
            <button
              key={r ?? ""}
              role="tab"
              aria-selected={b.role === r}
              className={`chip sketch ${b.role === r ? "is-on" : ""}`}
              onClick={() => board.setBoard({ ...b, role: r })}
            >
              {r ?? "Everyone"}
            </button>
          ))}
        </div>
      )}
      {teamBoard ? (
        <TeamTable rows={board.teams} />
      ) : (
        <LeaderboardTable rows={board.rows} showMode={b.kind === "global" && b.mode === null} highlight={highlight} selected={sel} />
      )}
      {confirm && selected && (
        <p className="error">
          Press Delete again to remove {selected.name}'s {fmtPoints(selected.points)} points ({MODE_LABELS[selected.mode]}).
        </p>
      )}
      {board.message && <p className="message">{board.message}</p>}
      {b.kind === "global" && (
        <div className="board-reset">
          <button type="button" className={`linkish ${resetting ? "is-bad" : ""}`} onClick={() => void reset()}>
            {resetting ? "Sure? Reset the global leaderboard" : "Reset global leaderboard"}
          </button>
          {resetting && (
            <span className="error">
              Every global board starts empty. A backup of all rounds is saved first, and event boards keep their scores. Click again to reset.
            </span>
          )}
        </div>
      )}
      <KeyHints hints={hints} />
    </div>
  );
}
