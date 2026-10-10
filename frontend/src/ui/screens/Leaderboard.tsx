import { useEffect, useState } from "react";
import type { RoundMode } from "../../api/types";
import { BOARDS, MODE_LABELS } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useLeaderboard } from "../../logic/useLeaderboard";
import { KeyHints } from "../components/KeyHints";
import { LeaderboardTable } from "../components/LeaderboardTable";

interface Props {
  /** Tab to open on: a mode, or null for the all-time board. */
  initial?: RoundMode | null;
  /** Name to mark, e.g. the player who just posted. */
  highlight?: string;
  onBack: () => void;
}

/** Operator view: tabs, moderation (select + delete twice), backup. */
export function Leaderboard({ initial = null, highlight, onBack }: Props) {
  const board = useLeaderboard(initial);
  const [sel, setSel] = useState<number | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const visible = Math.min(board.rows.length, 10);
  const tab = BOARDS.findIndex((b) => b.mode === board.mode);

  useEffect(() => {
    setSel(undefined);
    setConfirm(false);
  }, [board.mode]);

  const move = (d: number) => board.setMode(BOARDS[(tab + d + BOARDS.length) % BOARDS.length].mode);

  const remove = async () => {
    const row = sel !== undefined ? board.rows[sel] : undefined;
    if (!row) return;
    if (!confirm) return setConfirm(true);
    await board.remove(row);
    setConfirm(false);
    setSel(undefined);
  };

  useKeys({
    ...Object.fromEntries(BOARDS.map((b, i) => [String(i + 1), () => board.setMode(b.mode)])),
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    ArrowUp: () => {
      setConfirm(false);
      setSel((s) => Math.max(0, (s ?? 1) - 1));
    },
    ArrowDown: () => {
      setConfirm(false);
      setSel((s) => Math.min(visible - 1, (s ?? -1) + 1));
    },
    Delete: () => void remove(),
    Backspace: () => void remove(), // Mac laptops have no forward-delete key
    b: () => void board.exportBackup(),
    Escape: onBack,
    Enter: onBack,
  });

  const selected = sel !== undefined ? board.rows[sel] : undefined;
  return (
    <div className="panel sketch leaderboard">
      <div className="tabs" role="tablist">
        {BOARDS.map((b, i) => (
          <button
            key={b.title}
            role="tab"
            aria-selected={i === tab}
            className={`sketch ${i === tab ? "is-on" : ""}`}
            onClick={() => board.setMode(b.mode)}
          >
            <kbd>{i + 1}</kbd> {b.title}
          </button>
        ))}
      </div>
      <LeaderboardTable rows={board.rows} showMode={board.mode === null} highlight={highlight} selected={sel} />
      {confirm && selected && (
        <p className="error">
          Press Delete again to remove {selected.name}'s {selected.reps} ({MODE_LABELS[selected.mode]}).
        </p>
      )}
      {board.message && <p className="message">{board.message}</p>}
      <KeyHints
        hints={[
          [`1–${BOARDS.length}`, "Board"],
          ["↑↓", "Select"],
          ["Del", "Remove run", () => void remove()],
          ["B", "Backup file", () => void board.exportBackup()],
          ["Enter", "Menu", onBack],
        ]}
      />
    </div>
  );
}
