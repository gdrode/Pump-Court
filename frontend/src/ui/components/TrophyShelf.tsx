import { fmtPoints } from "@tracker/game";
import type { LeaderboardRow } from "../../api/types";

const INK = "#241f1a";
/** Cup, shine, base for 1st, 2nd and 3rd (matches --gold / --silver / --bronze in tokens.css). */
const METAL = [
  { cup: "#e9b829", shine: "#fbe9a0", base: "#8a6410" },
  { cup: "#b9c0c6", shine: "#eef1f3", base: "#6b7177" },
  { cup: "#c47a3e", shine: "#efc39c", base: "#7a4520" },
];
const PLACE = ["1st", "2nd", "3rd"];

/** One hand-drawn trophy. `place` 0–2; 1st is drawn bigger. */
function Trophy({ place }: { place: number }) {
  const m = METAL[place];
  const s = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg className="trophy__cup" viewBox="0 0 80 96" aria-hidden="true">
      <g filter="url(#rough-sm)">
        {/* handles */}
        <path d="M18 18 C2 18 2 44 22 46" fill="none" {...s} strokeWidth={5} />
        <path d="M62 18 C78 18 78 44 58 46" fill="none" {...s} strokeWidth={5} />
        <path d="M18 18 C2 18 2 44 22 46" fill="none" stroke={m.cup} strokeWidth={2} />
        <path d="M62 18 C78 18 78 44 58 46" fill="none" stroke={m.cup} strokeWidth={2} />
        {/* cup */}
        <path d="M14 10 L66 10 C66 42 54 56 40 58 C26 56 14 42 14 10 Z" fill={m.cup} {...s} />
        <path d="M22 16 C22 34 28 44 34 48" fill="none" stroke={m.shine} strokeWidth="4" strokeLinecap="round" />
        {/* stem and base */}
        <path d="M34 58 L46 58 L48 72 L32 72 Z" fill={m.cup} {...s} />
        <path d="M20 72 L60 72 L62 88 L18 88 Z" fill={m.base} {...s} />
        <text x="40" y="38" textAnchor="middle" fontSize="20" fontFamily="var(--font)" fill={INK}>
          {place + 1}
        </text>
      </g>
    </svg>
  );
}

/**
 * A sketched shelf with the gold, silver and bronze trophies, labelled with
 * the current top 3 on the all-time board (podium order: 2nd, 1st, 3rd).
 */
export function TrophyShelf({ rows }: { rows: LeaderboardRow[] }) {
  const order = [1, 0, 2];
  return (
    <figure className="trophy-shelf" aria-label="Top 3 of all time">
      <figcaption className="trophy-shelf__title">Hall of fame</figcaption>
      <div className="trophy-shelf__row">
        {order.map((place) => {
          const r = rows[place];
          return (
            <div key={place} className={`trophy trophy--${place + 1}`}>
              <Trophy place={place} />
              <span className="trophy__name">{r ? r.name : "???"}</span>
              <span className="trophy__pts">{r ? `${fmtPoints(r.points)} pts` : PLACE[place]}</span>
            </div>
          );
        })}
      </div>
      <svg className="trophy-shelf__plank" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">
        <g filter="url(#rough-sm)" stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M4 4 L296 4 L296 14 L4 14 Z" fill="#b98a55" />
          <path d="M30 14 L30 28 L50 14 M270 14 L270 28 L250 14" fill="none" />
        </g>
      </svg>
    </figure>
  );
}
