/** "🔥 1.3x · 12 in a row" under a score, once a streak has a multiplier. */
export function StreakBadge({ streak, multiplier, big = false }: { streak: number; multiplier: number; big?: boolean }) {
  if (multiplier <= 1) return null;
  return (
    <span className={`streak-badge ${big ? "streak-badge--big" : ""}`} key={multiplier}>
      🔥 {multiplier}x · {streak} in a row
    </span>
  );
}
