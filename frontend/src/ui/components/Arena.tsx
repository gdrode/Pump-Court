// The home screen's "court": a gym floor along the bottom of the screen and a
// mat the dragon stands on. Pure decoration (aria-hidden, no clicks).

const INK = "#241f1a";

/** Wooden court floor across the bottom of the screen: boards in perspective, a baseline and the centre circle. */
export function ArenaFloor() {
  // Floor boards fan out from a vanishing point above the screen.
  const boards = Array.from({ length: 17 }, (_, i) => {
    const x = (i / 16) * 1200;
    const top = 600 + (x - 600) * 0.62;
    return <path key={i} d={`M${top} 0 L${x} 120`} />;
  });
  return (
    <svg className="arena-floor" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
      <path className="arena-floor__wood" d="M0 6 Q300 0 600 4 T1200 5 L1200 120 L0 120 Z" />
      <g className="arena-floor__boards">{boards}</g>
      {/* centre circle, squashed by the perspective */}
      <ellipse className="arena-floor__circle" cx="600" cy="74" rx="190" ry="40" />
      <path className="arena-floor__line" d="M600 6 L600 120" />
      <path className="arena-floor__line" d="M80 120 L230 6 M1120 120 L970 6" />
      <path className="arena-floor__edge" d="M0 6 Q300 0 600 4 T1200 5" fill="none" stroke={INK} />
    </svg>
  );
}

/** A hand-drawn exercise mat in perspective, under the dragon's feet. */
export function ArenaMat() {
  const s = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg className="arena-mat" viewBox="0 0 400 90" aria-hidden="true">
      <g filter="url(#rough-sm)">
        {/* mat thickness, then the top */}
        <path d="M30 70 L370 70 L370 80 L30 80 Z" fill="#4a2a99" {...s} />
        <path d="M70 12 L330 12 L370 70 L30 70 Z" fill="#6b3fd4" {...s} />
        {/* stitched border and the centre stripe */}
        <path d="M82 20 L318 20 L350 63 L50 63 Z" fill="none" stroke="#e4dbf8" strokeWidth="2.5" strokeDasharray="7 6" />
        <path d="M188 12 L212 12 L216 70 L184 70 Z" fill="#f6e6ab" stroke={INK} strokeWidth="2" />
        {/* scuffs */}
        <path d="M110 40 L132 38 M262 48 L290 46" stroke="#e4dbf8" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      </g>
    </svg>
  );
}
