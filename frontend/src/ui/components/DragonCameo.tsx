// A small dragon peeking in over an edge of the screen: lifting a dumbbell
// (home), asleep on the leaderboard, cheering on the results. Decoration only.

export type CameoPose = "lift" | "sleep" | "cheer";

const INK = "#241f1a";
const GREEN = "#5bb25a";
const HORN = "#f1dc9c";
const CHEEK = "#f3a3a0";
const EYE = "#5a2a1a";
const BAND = "#6b3fd4";
const CREAM = "#f6e3a6";

interface Props {
  pose: CameoPose;
  /** Where it sits; positioned in styles.css (".cameo--<place>"). */
  place: "home" | "board" | "results";
}

/** Head and paws, drawn so the bottom edge (y = 100) is the edge it peeks over. */
export function DragonCameo({ pose, place }: Props) {
  const s = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <div className={`cameo cameo--${place} cameo--${pose}`} aria-hidden="true">
      <svg viewBox="0 0 150 110">
        {pose === "sleep" && (
          <g className="cameo__zzz" fill={INK} fontFamily="var(--font)">
            <text className="z z--1" x="104" y="34" fontSize="14">z</text>
            <text className="z z--2" x="112" y="22" fontSize="18">z</text>
            <text className="z z--3" x="122" y="8" fontSize="22">Z</text>
          </g>
        )}
        {pose === "cheer" && (
          <g className="cameo__sparks" fill={CREAM} stroke={INK} strokeWidth="2">
            <path d="M14 20 L17 28 L25 31 L17 34 L14 42 L11 34 L3 31 L11 28 Z" />
            <path d="M126 14 L128 20 L134 22 L128 24 L126 30 L124 24 L118 22 L124 20 Z" />
          </g>
        )}
        <g className="cameo__body" filter="url(#rough-sm)">
          <g className="cameo__head">
            {/* horns and fins */}
            <path d="M46 36 C40 24 44 14 52 10 C51 20 54 27 58 31 Z" fill={HORN} {...s} />
            <path d="M94 36 C100 24 96 14 88 10 C89 20 86 27 82 31 Z" fill={HORN} {...s} />
            <path d="M36 62 L20 52 L30 74 Z" fill={GREEN} {...s} />
            <path d="M104 62 L120 52 L110 74 Z" fill={GREEN} {...s} />
            <ellipse cx="70" cy="70" rx="38" ry="36" fill={GREEN} {...s} />
            {/* headband */}
            <path d="M34 54 C52 44 88 44 106 54 L105 63 C88 53 52 53 35 63 Z" fill={BAND} {...s} />
            {/* eyes */}
            {pose === "sleep" ? (
              <path d="M50 76 Q57 82 64 76 M76 76 Q83 82 90 76" fill="none" {...s} />
            ) : (
              <g>
                <ellipse cx="56" cy="76" rx="6" ry="7.5" fill={EYE} />
                <ellipse cx="84" cy="76" rx="6" ry="7.5" fill={EYE} />
                <circle cx="58" cy="73" r="2.2" fill="#fff" />
                <circle cx="86" cy="73" r="2.2" fill="#fff" />
              </g>
            )}
            <ellipse cx="44" cy="88" rx="6" ry="3.5" fill={CHEEK} />
            <ellipse cx="96" cy="88" rx="6" ry="3.5" fill={CHEEK} />
            {pose === "cheer" && <path d="M60 88 Q70 102 80 88 Z" fill={EYE} {...s} strokeWidth={2.5} />}
            {pose === "lift" && <path d="M62 89 Q70 95 78 89" fill="none" {...s} />}
            {pose === "sleep" && <circle cx="70" cy="91" r="3" fill="none" {...s} strokeWidth={2.5} />}
          </g>
          {/* paws: on the edge, or up in the air */}
          {pose === "cheer" ? (
            <g className="cameo__arms">
              <path className="cameo__arm cameo__arm--l" d="M36 104 C26 90 18 70 22 56 C26 50 34 52 34 60 C34 72 44 90 48 102 Z" fill={GREEN} {...s} />
              <path className="cameo__arm cameo__arm--r" d="M104 104 C114 90 122 70 118 56 C114 50 106 52 106 60 C106 72 96 90 92 102 Z" fill={GREEN} {...s} />
            </g>
          ) : (
            <g>
              <ellipse cx="44" cy="104" rx="13" ry="8" fill={GREEN} {...s} />
              <path d="M38 108 L38 112 M44 109 L44 113 M50 108 L50 112" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            </g>
          )}
          {pose === "lift" && (
            <g className="cameo__lift">
              <rect x="112" y="40" width="26" height="4" rx="2" fill="#8a8172" stroke={INK} strokeWidth="2" />
              <rect x="108" y="32" width="7" height="20" rx="2" fill="#4a443c" stroke={INK} strokeWidth="2" />
              <rect x="135" y="32" width="7" height="20" rx="2" fill="#4a443c" stroke={INK} strokeWidth="2" />
              <path d="M98 106 C110 98 118 74 120 50 C121 42 130 42 130 50 C130 72 120 98 112 108 Z" fill={GREEN} {...s} />
            </g>
          )}
          {pose === "sleep" && (
            <g>
              <ellipse cx="96" cy="104" rx="13" ry="8" fill={GREEN} {...s} />
              <path d="M90 108 L90 112 M96 109 L96 113 M102 108 L102 112" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
