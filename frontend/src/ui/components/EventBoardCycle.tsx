import type { EventInfo } from "../../api/types";
import { useEventBoardCycle, type BoardRef } from "../../logic/useEvents";
import { LeaderboardTable, TeamTable } from "./LeaderboardTable";

interface Props {
  event: EventInfo;
  /** Rows per board. */
  rows?: number;
  /** Click: open this board on the leaderboard screen. */
  onOpen?: (board: BoardRef) => void;
}

/**
 * The active event's boards, one after another (each mode's Everyone board,
 * each role's, then the team boards), with dots for where it is in the cycle.
 */
export function EventBoardCycle({ event, rows = 5, onOpen }: Props) {
  const cycle = useEventBoardCycle(event, rows);
  if (!cycle) return null;
  return (
    <button
      type="button"
      className="event-cycle sketch"
      onClick={() => onOpen?.(cycle.board)}
      title="Open this board"
      aria-live="polite"
    >
      <span className="event-cycle__head">
        <span className="eyebrow">{event.name}</span>
        <span className="event-cycle__title" key={cycle.title}>
          {cycle.title}
        </span>
      </span>
      <span className="event-cycle__table" key={`t-${cycle.title}`}>
        {cycle.team ? <TeamTable rows={cycle.teams} limit={rows} /> : <LeaderboardTable rows={cycle.players} limit={rows} />}
      </span>
      {cycle.count > 1 && (
        <span className="event-cycle__dots" aria-hidden="true">
          {Array.from({ length: cycle.count }, (_, i) => (
            <i key={i} className={i === cycle.index ? "is-on" : ""} />
          ))}
        </span>
      )}
    </button>
  );
}
