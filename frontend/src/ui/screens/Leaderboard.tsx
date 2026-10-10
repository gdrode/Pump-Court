import { useEffect, useState } from "react";
import type { Category } from "../../api/types";
import { CATEGORIES } from "../../config/modes";
import { useKeys } from "../../logic/useKeys";
import { useLeaderboard } from "../../logic/useLeaderboard";
import { CrowdViewPicker } from "../components/CrowdViewPicker";
import { KeyHints } from "../components/KeyHints";
import { LeaderboardTable } from "../components/LeaderboardTable";

interface Props {
  initial?: Category;
  /** Name to mark, e.g. the player who just posted. */
  highlight?: string;
  onBack: () => void;
}

/** Operator view: tabs, moderation (select + delete twice), backup, crowd screen controls. */
export function Leaderboard({ initial = "thirtySecond", highlight, onBack }: Props) {
  const board = useLeaderboard(initial);
  const [sel, setSel] = useState<number | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const visible = Math.min(board.rows.length, 10);

  useEffect(() => {
    setSel(undefined);
    setConfirm(false);
  }, [board.category, board.includeTeam]);

  const move = (d: number) => {
    const i = CATEGORIES.findIndex((c) => c.id === board.category);
    board.setCategory(CATEGORIES[(i + d + CATEGORIES.length) % CATEGORIES.length].id);
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
    "1": () => board.setCategory(CATEGORIES[0].id),
    "2": () => board.setCategory(CATEGORIES[1].id),
    "3": () => board.setCategory(CATEGORIES[2].id),
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
    t: () => board.setIncludeTeam(!board.includeTeam),
    Escape: onBack,
    Enter: onBack,
  });

  const selected = sel !== undefined ? board.rows[sel] : undefined;
  return (
    <div className="panel sketch leaderboard">
      <div className="tabs" role="tablist">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === board.category}
            className={`sketch ${c.id === board.category ? "is-on" : ""}`}
            onClick={() => board.setCategory(c.id)}
          >
            <kbd>{i + 1}</kbd> {c.title}
          </button>
        ))}
      </div>
      <LeaderboardTable rows={board.rows} highlight={highlight} selected={sel} />
      {confirm && selected && (
        <p className="error">
          Press Delete again to remove {selected.name}'s {selected.cleanReps} from {CATEGORIES.find((c) => c.id === board.category)?.title}.
        </p>
      )}
      {board.message && <p className="message">{board.message}</p>}
      <div className="board-tools">
        <label className="check">
          <input type="checkbox" checked={board.includeTeam} onChange={(e) => board.setIncludeTeam(e.target.checked)} />
          Show team runs <kbd>T</kbd>
        </label>
        <CrowdViewPicker />
      </div>
      <KeyHints
        hints={[
          ["1–3", "Board"],
          ["↑↓", "Select"],
          ["Del", "Remove run", () => void remove()],
          ["B", "Backup file", () => void board.exportBackup()],
          ["Enter", "Menu", onBack],
        ]}
      />
    </div>
  );
}
