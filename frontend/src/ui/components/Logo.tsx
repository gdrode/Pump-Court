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
 * "Pump Court" in big cartoon letters (ink outline, offset shadow, a little
 * wobble and bob), with the three referee lights glowing in turn.
 */
export function Logo({ variant = "home" }: Props) {
  return (
    <h1 className={`logo logo--${variant}`} aria-label="Pump Court">
      <span className="logo__lights" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="logo__words" aria-hidden="true">
        <span className="logo__word logo__word--pump">{letters("Pump", 0)}</span>
        <span className="logo__word logo__word--court">
          {letters("Court", 4)}
          <span className="logo__spark">✦</span>
        </span>
      </span>
    </h1>
  );
}
