interface Props {
  /** "crowd": sized for the big second screen. */
  variant?: "home" | "crowd";
}

/** Splits a word into letters, each with its index (for the wobble and the bob). */
function letters(word: string, from: number) {
  return [...word].map((ch, i) => (
    <span key={i} className="logo__l" style={{ "--i": from + i } as React.CSSProperties}>
      {ch}
    </span>
  ));
}

/**
 * The game crest: a hand-drawn sticker card with "PUMP" in big cartoon letters
 * over a dumbbell, a gold "COURT" ribbon across the bottom (the trophy gold),
 * and the three referee lights sitting on top, glowing in turn.
 */
export function Logo({ variant = "home" }: Props) {
  return (
    <h1 className={`logo logo--${variant}`} aria-label="Pump Court">
      <span className="logo__crest" aria-hidden="true">
        {/* the card, with its hard ink shadow */}
        <svg className="logo__card" viewBox="0 0 400 200" preserveAspectRatio="none">
          <g filter="url(#rough-sm)">
            <path className="logo__card-shadow" d="M14 10 Q200 -2 386 8 Q398 100 390 190 Q200 200 10 192 Q0 100 14 10 Z" transform="translate(9 11)" />
            <path className="logo__card-face" d="M14 10 Q200 -2 386 8 Q398 100 390 190 Q200 200 10 192 Q0 100 14 10 Z" />
            <path className="logo__card-line" d="M30 26 Q200 16 370 24 Q380 100 374 176 Q200 184 26 178 Q18 100 30 26 Z" />
          </g>
        </svg>

        <span className="logo__lights">
          <i />
          <i />
          <i />
        </span>

        <span className="logo__main">
          <span className="logo__bell">
            <i className="logo__bar" />
            <i className="logo__plate logo__plate--l" />
            <i className="logo__plate logo__plate--l2" />
            <i className="logo__plate logo__plate--r" />
            <i className="logo__plate logo__plate--r2" />
          </span>
          <span className="logo__word logo__word--pump">{letters("PUMP", 0)}</span>
          <span className="logo__spark">✦</span>
        </span>

        <span className="logo__ribbon">
          <svg viewBox="0 0 300 60" preserveAspectRatio="none">
            <g filter="url(#rough-sm)" stroke="#241f1a" strokeWidth="3" strokeLinejoin="round">
              {/* tails behind, with their folds */}
              <path className="logo__ribbon-back" d="M0 20 L46 20 L46 58 L0 58 L16 39 Z" />
              <path className="logo__ribbon-back" d="M300 20 L254 20 L254 58 L300 58 L284 39 Z" />
              <path className="logo__ribbon-fold" d="M30 50 L46 58 L46 50 Z M270 50 L254 58 L254 50 Z" />
              {/* front band, gently arched */}
              <path className="logo__ribbon-front" d="M30 6 Q150 -4 270 6 L270 50 Q150 40 30 50 Z" />
            </g>
          </svg>
          <span className="logo__word logo__word--court">{letters("COURT", 4)}</span>
        </span>
      </span>
    </h1>
  );
}
